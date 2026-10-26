#!/usr/bin/env bash
# =============================================================================
# concorrencia_os_estoque.sh — corrida real entre duas sessoes PostgreSQL
#
# Os testes SQL anteriores provam idempotencia em sequencia. Este script abre
# duas conexoes ao mesmo tempo: a sessao A executa o RPC e segura a transacao
# aberta; a sessao B executa o RPC concorrente e precisa esperar o lock da OS
# ou do item. Uma terceira conexao confirma a espera em pg_stat_activity, para
# que o resultado nao seja uma execucao sequencial disfarcada.
#
# Cenarios (RF05/RF10, RN da baixa automatica e do cancelamento com estorno):
#   C1  duas finalizacoes da mesma OS       -> uma unica baixa
#   C2  duas OS disputando o ultimo saldo   -> uma conclui, outra falha, saldo >= 0
#   C3  finalizar x cancelar a mesma OS     -> saldo coerente com o status final
#   C4  dois cancelamentos da mesma OS      -> estorno unico
#
# Grava dados reais. Use SOMENTE em banco descartavel (Supabase efemero).
# As fixtures usam o prefixo QA-CONC e sao removidas ao final.
#
# Uso:
#   PSQL='psql postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
#     SIGAUTO_BANCO_DESCARTAVEL=1 bash database/tests/concorrencia_os_estoque.sh
# =============================================================================
set -u

if [ "${SIGAUTO_BANCO_DESCARTAVEL:-}" != "1" ]; then
  echo "Recusado: defina SIGAUTO_BANCO_DESCARTAVEL=1 apenas para banco efemero." >&2
  exit 2
fi

PSQL="${PSQL:-psql ${DATABASE_URL:-}}"
TMP="$(mktemp -d)"
FALHAS=0
VEICULO=""
GESTOR=""

sql() { $PSQL -X -q -t -A -v ON_ERROR_STOP=1 "$@"; }

falha() { echo "FALHA $1"; FALHAS=$((FALHAS + 1)); }
ok() { echo "OK    $1"; }

limpar() {
  sql <<'SQL' >/dev/null 2>&1
DELETE FROM public.historico_status_os WHERE id_os IN (SELECT id FROM public.ordem_servico WHERE descricao LIKE 'QA-CONC %');
DELETE FROM public.os_comissao WHERE id_os IN (SELECT id FROM public.ordem_servico WHERE descricao LIKE 'QA-CONC %');
DELETE FROM public.os_baixa_estoque WHERE id_os IN (SELECT id FROM public.ordem_servico WHERE descricao LIKE 'QA-CONC %');
DELETE FROM public.movimentacao_estoque WHERE id_item IN (SELECT id FROM public.item_estoque WHERE codigo LIKE 'QA-CONC-%');
DELETE FROM public.os_peca WHERE id_os IN (SELECT id FROM public.ordem_servico WHERE descricao LIKE 'QA-CONC %');
DELETE FROM public.ordem_servico WHERE descricao LIKE 'QA-CONC %';
DELETE FROM public.item_estoque WHERE codigo LIKE 'QA-CONC-%';
SQL
}

# Cria um item com saldo inicial e devolve o id.
criar_item() {
  local codigo="$1" saldo="$2"
  sql <<SQL
INSERT INTO public.item_estoque (codigo, nome, unidade, quantidade, qtd_minima, preco_unit)
VALUES ('$codigo', 'Item $codigo', 'UN', $saldo, 1, 10)
RETURNING id;
SQL
}

# Cria uma OS aberta com uma peca do item, via RPC autenticado como gestor.
criar_os() {
  local rotulo="$1" item="$2" qtd="$3"
  sql <<SQL | tail -n 1
SELECT set_config('request.jwt.claims', json_build_object('sub', '$GESTOR', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
SELECT id FROM public.criar_ordem_servico_com_itens(
  jsonb_build_object('id_veiculo', '$VEICULO', 'descricao', 'QA-CONC $rotulo'),
  '[]'::jsonb,
  jsonb_build_array(jsonb_build_object('id_item', '$item', 'descricao', 'Peca', 'quantidade', $qtd, 'valor_unitario', 10))
);
SQL
}

# Executa um RPC como gestor numa transacao que dorme antes do COMMIT.
rpc_segurando() {
  local chamada="$1" espera="$2" saida="$3"
  sql > "$saida" 2>&1 <<SQL
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub', '$GESTOR', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT 'rpc-ok' FROM (SELECT $chamada) r;
SELECT pg_sleep($espera);
COMMIT;
SQL
  echo "exit=$?" >> "$saida"
}

# Roda A (segura 2 s) e B (inicia 0,7 s depois) e confirma que B esperou lock.
corrida() {
  local nome="$1" chamada_a="$2" chamada_b="$3"
  rpc_segurando "$chamada_a" 2 "$TMP/$nome.a" &
  local pid_a=$!
  sleep 0.7
  rpc_segurando "$chamada_b" 0 "$TMP/$nome.b" &
  local pid_b=$!
  sleep 0.6
  local esperando
  esperando="$(sql -c "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%ordem_servico(%'")"
  wait "$pid_a" "$pid_b"
  if [ "${esperando:-0}" -ge 1 ]; then
    ok "$nome: sessao B esperou lock da sessao A (contencao real comprovada)"
  else
    falha "$nome: nenhuma sessao em espera de lock; a corrida nao ocorreu"
  fi
}

saldo() { sql -c "SELECT trim_scale(quantidade) FROM public.item_estoque WHERE id = '$1'"; }
movs() { sql -c "SELECT count(*) || ':' || trim_scale(COALESCE(sum(quantidade), 0)) FROM public.movimentacao_estoque WHERE id_item = '$1' AND origem = 'os' AND tipo = '$2'"; }
status_os() { sql -c "SELECT status FROM public.ordem_servico WHERE id = '$1'"; }
rpc_ok() { grep -q '^rpc-ok$' "$1" && grep -q '^exit=0$' "$1"; }

GESTOR="$(sql -c "SELECT id FROM public.usuario WHERE perfil = 'gestor' AND ativo ORDER BY email LIMIT 1")"
VEICULO="$(sql -c "SELECT id FROM public.veiculo ORDER BY id LIMIT 1")"
if [ -z "$GESTOR" ] || [ -z "$VEICULO" ]; then
  echo "Fixtures de gestor/veiculo ausentes; rode react-app/e2e/setup-database.mjs antes." >&2
  exit 2
fi
limpar

FIN="'valor', 0, NULL, 'pix', NULL"

# C1 — mesma OS finalizada duas vezes ao mesmo tempo.
ITEM="$(criar_item QA-CONC-C1 5)"
OS="$(criar_os C1 "$ITEM" 2)"
corrida C1 "public.finalizar_ordem_servico('$OS', $FIN)" "public.finalizar_ordem_servico('$OS', $FIN)"
if rpc_ok "$TMP/C1.a" && rpc_ok "$TMP/C1.b"; then ok "C1: as duas chamadas retornaram (reconclusao idempotente)"; else falha "C1: chamada recusada: $(cat "$TMP/C1.a" "$TMP/C1.b" | tr '\n' ' ')"; fi
[ "$(saldo "$ITEM")" = "3" ] && ok "C1: saldo 5 -> 3, baixa unica" || falha "C1: saldo esperado 3, observado $(saldo "$ITEM")"
[ "$(movs "$ITEM" saida)" = "1:2" ] && ok "C1: um unico movimento de saida de 2" || falha "C1: movimentos de saida $(movs "$ITEM" saida), esperado 1:2"

# C2 — duas OS disputando a ultima unidade.
ITEM="$(criar_item QA-CONC-C2 1)"
OS_A="$(criar_os C2A "$ITEM" 1)"
OS_B="$(criar_os C2B "$ITEM" 1)"
corrida C2 "public.finalizar_ordem_servico('$OS_A', $FIN)" "public.finalizar_ordem_servico('$OS_B', $FIN)"
if rpc_ok "$TMP/C2.a" && ! rpc_ok "$TMP/C2.b" && grep -qi 'saldo insuficiente' "$TMP/C2.b"; then
  ok "C2: A concluiu e B foi recusada por saldo insuficiente"
else
  falha "C2: resultado inesperado: A=[$(tr '\n' ' ' < "$TMP/C2.a")] B=[$(tr '\n' ' ' < "$TMP/C2.b")]"
fi
[ "$(saldo "$ITEM")" = "0" ] && ok "C2: saldo final 0, nunca negativo" || falha "C2: saldo final $(saldo "$ITEM")"
[ "$(status_os "$OS_B")" = "aberta" ] && ok "C2: OS recusada permaneceu aberta (rollback integral)" || falha "C2: OS B ficou $(status_os "$OS_B")"
[ "$(movs "$ITEM" saida)" = "1:1" ] && ok "C2: um unico movimento de saida" || falha "C2: movimentos $(movs "$ITEM" saida)"

# C3 — finalizar e cancelar a mesma OS ao mesmo tempo.
ITEM="$(criar_item QA-CONC-C3 4)"
OS="$(criar_os C3 "$ITEM" 3)"
corrida C3 "public.finalizar_ordem_servico('$OS', $FIN)" "public.cancelar_ordem_servico('$OS')"
ST="$(status_os "$OS")"; SD="$(saldo "$ITEM")"
if { [ "$ST" = "cancelada" ] && [ "$SD" = "4" ]; } || { [ "$ST" = "concluida" ] && [ "$SD" = "1" ]; }; then
  ok "C3: status final $ST com saldo $SD coerente"
else
  falha "C3: status $ST com saldo $SD (incoerente)"
fi
[ "$(movs "$ITEM" entrada)" = "1:3" ] && ok "C3: estorno de 3 registrado uma vez" || falha "C3: entradas $(movs "$ITEM" entrada), esperado 1:3"

# C4 — dois cancelamentos simultaneos de OS ja concluida.
ITEM="$(criar_item QA-CONC-C4 6)"
OS="$(criar_os C4 "$ITEM" 2)"
sql >/dev/null <<SQL
SELECT set_config('request.jwt.claims', json_build_object('sub', '$GESTOR', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
SELECT public.finalizar_ordem_servico('$OS', $FIN);
SQL
corrida C4 "public.cancelar_ordem_servico('$OS')" "public.cancelar_ordem_servico('$OS')"
[ "$(saldo "$ITEM")" = "6" ] && ok "C4: saldo restaurado para 6 uma unica vez" || falha "C4: saldo $(saldo "$ITEM"), esperado 6"
[ "$(movs "$ITEM" entrada)" = "1:2" ] && ok "C4: um unico estorno" || falha "C4: entradas $(movs "$ITEM" entrada), esperado 1:2"

limpar
RESTANTES="$(sql -c "SELECT count(*) FROM public.item_estoque WHERE codigo LIKE 'QA-CONC-%'")"
[ "$RESTANTES" = "0" ] || echo "AVISO fixtures QA-CONC nao removidas: $RESTANTES item(ns)"
rm -rf "$TMP"

if [ "$FALHAS" -gt 0 ]; then
  echo "REPROVADO: $FALHAS verificacao(oes) de concorrencia falharam."
  exit 1
fi
echo "APROVADO: corrida real em finalizacao, saldo e cancelamento."

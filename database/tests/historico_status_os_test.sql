-- RN: ledger de status inclui criacao, updates, RPCs, cancelamento e reabertura.
-- Usa fixtures locais existentes e termina com ROLLBACK.
BEGIN;
DO $$
DECLARE
  v_gestor UUID;
  v_veiculo UUID;
  v_os UUID;
  v_count INTEGER;
  v_status public.status_os;
  v_status_anterior public.status_os;
  v_mecanico UUID;
  v_inicio TIMESTAMPTZ;
  v_fim TIMESTAMPTZ;
  v_duracao INTERVAL;
  v_bloqueado BOOLEAN;
BEGIN
  IF has_table_privilege('service_role', 'public.historico_status_os', 'INSERT')
     OR has_table_privilege('service_role', 'public.historico_status_os', 'UPDATE')
     OR has_table_privilege('service_role', 'public.historico_status_os', 'DELETE') THEN
    RAISE EXCEPTION 'service_role recebeu DML direto no ledger append-only.';
  END IF;
  SELECT id INTO v_gestor FROM public.usuario WHERE perfil = 'gestor' AND ativo LIMIT 1;
  SELECT id INTO v_mecanico FROM public.usuario WHERE perfil = 'mecanico' AND ativo LIMIT 1;
  SELECT id INTO v_veiculo FROM public.veiculo LIMIT 1;
  IF v_gestor IS NULL OR v_veiculo IS NULL THEN
    RAISE EXCEPTION 'Fixtures de gestor ou veiculo ausentes; teste de historico nao executado.';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_gestor, 'role', 'authenticated')::text, true);
  INSERT INTO public.ordem_servico (id_veiculo, id_usuario, descricao, status)
  VALUES (v_veiculo, v_gestor, 'Teste historico de status', 'aberta')
  RETURNING id INTO v_os;

  SET LOCAL ROLE authenticated;
  UPDATE public.ordem_servico SET status = 'em_andamento' WHERE id = v_os;
  PERFORM public.finalizar_ordem_servico(v_os, 'valor', 0, NULL, 'pix', NULL);
  UPDATE public.ordem_servico SET status = 'em_andamento' WHERE id = v_os;
  PERFORM public.cancelar_ordem_servico(v_os);
  UPDATE public.ordem_servico SET status = 'aberta' WHERE id = v_os;

  SELECT count(*) INTO v_count FROM public.historico_status_os WHERE id_os = v_os;
  IF v_count <> 6 THEN
    RAISE EXCEPTION 'Esperadas seis transicoes, observadas %.', v_count;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.historico_status_os
     WHERE id_os = v_os AND id_autor IS DISTINCT FROM v_gestor
  ) THEN
    RAISE EXCEPTION 'Autor da transicao nao corresponde a identidade autenticada.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.historico_status_os
     WHERE id_os = v_os AND ocorrido_em IS NULL
  ) THEN
    RAISE EXCEPTION 'Transicao sem timestamp de banco.';
  END IF;
  SELECT status_anterior, status_novo INTO v_status_anterior, v_status
    FROM public.historico_status_os WHERE id_os = v_os ORDER BY id LIMIT 1;
  IF v_status_anterior IS NOT NULL OR v_status <> 'aberta' THEN
    RAISE EXCEPTION 'Status inicial nao registrado.';
  END IF;
  SELECT inicio_etapa, fim_etapa, duracao_etapa
    INTO v_inicio, v_fim, v_duracao
    FROM public.duracao_etapa_os WHERE id_os = v_os ORDER BY inicio_etapa DESC LIMIT 1;
  IF v_inicio IS NULL OR v_fim IS NOT NULL OR v_duracao < interval '0 seconds' THEN
    RAISE EXCEPTION 'Duracao da etapa atual invalida: inicio=%, fim=%, duracao=%.', v_inicio, v_fim, v_duracao;
  END IF;

  -- Histórico e view seguem exatamente a visibilidade da OS pai.
  SELECT count(*) INTO v_count FROM public.ordem_servico WHERE id = v_os;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Gestor nao leu a OS de teste.'; END IF;
  SELECT count(*) INTO v_count FROM public.historico_status_os WHERE id_os = v_os;
  IF v_count <> 6 THEN RAISE EXCEPTION 'Gestor nao leu o historico da OS.'; END IF;

  v_bloqueado := false;
  BEGIN
    UPDATE public.historico_status_os SET status_novo = 'cancelada' WHERE id_os = v_os;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_bloqueado := true;
  END;
  IF NOT v_bloqueado THEN RAISE EXCEPTION 'Ledger aceitou UPDATE direto.'; END IF;

  v_bloqueado := false;
  BEGIN
    DELETE FROM public.historico_status_os WHERE id_os = v_os;
  EXCEPTION WHEN insufficient_privilege THEN
    v_bloqueado := true;
  END;
  IF NOT v_bloqueado THEN RAISE EXCEPTION 'Ledger aceitou DELETE direto.'; END IF;

  -- Mecânico sem atribuição não enxerga a OS nem o histórico derivado dela.
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_mecanico, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.ordem_servico WHERE id = v_os;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Fixture inesperadamente visivel ao mecanico.'; END IF;
  SELECT count(*) INTO v_count FROM public.historico_status_os WHERE id_os = v_os;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Historico exposto sem visibilidade da OS pai.'; END IF;
  SELECT count(*) INTO v_count FROM public.duracao_etapa_os WHERE id_os = v_os;
  IF v_count <> 0 THEN RAISE EXCEPTION 'View de duracao exposta sem visibilidade da OS pai.'; END IF;

  RAISE NOTICE 'OK: criacao, update, conclusao, reabertura, cancelamento, autoria, RLS e duracao validados.';
END;
$$;
ROLLBACK;

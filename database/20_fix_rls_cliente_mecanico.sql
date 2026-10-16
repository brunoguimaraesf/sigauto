-- =============================================================================
-- 20_fix_rls_cliente_mecanico.sql
-- Corrige a leitura de clientes pelo mecanico depois da normalizacao da
-- migracao 11. ordem_servico.id_mecanico referencia funcionario.id, enquanto
-- auth.uid() identifica usuario.id.
-- =============================================================================

BEGIN;

SET LOCAL search_path = public, pg_catalog;

-- O cadastro administrativo do backend confirma e ativa a conta depois de
-- validar o gestor. Uma chamada direta ao signup publico, por outro lado,
-- nasce inativa: mesmo que a opcao seja habilitada por engano no painel do
-- Supabase, o JWT nao ganha acesso as policies do sistema.
CREATE OR REPLACE FUNCTION public.fn_handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  INSERT INTO public.usuario (id, nome, email, perfil, ativo)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'nome', ''),
      NULLIF(NEW.raw_user_meta_data->>'name', ''),
      split_part(NEW.email, '@', 1),
      'Usuario'
    ),
    NEW.email,
    'mecanico'::public.perfil_usuario,
    false
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        nome = EXCLUDED.nome;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_handle_new_auth_user() IS
  'Cria conta publica inativa e com perfil minimo. Somente o cadastro administrativo autenticado ativa usuario e funcionario.';

REVOKE ALL ON FUNCTION public.fn_handle_new_auth_user() FROM PUBLIC, anon, authenticated;

-- Compatibilidade de rollout: antes de publicar o frontend sem o campo legado,
-- torna todo texto antigo visivel pela entidade estruturada. A migracao 25
-- repete a garantia e so entao remove cliente.endereco.
ALTER TABLE public.endereco
  ALTER COLUMN ponto_referencia TYPE VARCHAR(255);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'cliente' AND column_name = 'endereco'
  ) THEN
    EXECUTE $sql$
      INSERT INTO public.endereco (id_cliente, ponto_referencia)
      SELECT c.id, btrim(c.endereco)
        FROM public.cliente c
       WHERE NULLIF(btrim(c.endereco), '') IS NOT NULL
      ON CONFLICT (id_cliente) DO UPDATE
        SET ponto_referencia = EXCLUDED.ponto_referencia
      WHERE COALESCE(
        NULLIF(btrim(public.endereco.cep), ''), NULLIF(btrim(public.endereco.logradouro), ''),
        NULLIF(btrim(public.endereco.numero), ''), NULLIF(btrim(public.endereco.complemento), ''),
        NULLIF(btrim(public.endereco.bairro), ''), NULLIF(btrim(public.endereco.cidade), ''),
        NULLIF(btrim(public.endereco.uf), ''), NULLIF(btrim(public.endereco.ponto_referencia), '')
      ) IS NULL
    $sql$;
  END IF;
END;
$$;

DROP POLICY IF EXISTS pol_cliente_mecanico_select ON public.cliente;
CREATE POLICY pol_cliente_mecanico_select ON public.cliente
  FOR SELECT
  TO authenticated
  USING (
    public.fn_perfil_usuario_atual() = 'mecanico'
    AND EXISTS (
      SELECT 1
      FROM public.veiculo v
      JOIN public.ordem_servico os ON os.id_veiculo = v.id
      JOIN public.funcionario f ON f.id = os.id_mecanico
      WHERE v.id_cliente = cliente.id
        AND f.id_usuario = auth.uid()
        AND f.ativo = true
    )
  );

COMMENT ON POLICY pol_cliente_mecanico_select ON public.cliente IS
  'RN03/RN10: mecanico le apenas clientes de veiculos em OS atribuidas ao seu registro de funcionario.';

-- Contas antigas criadas apenas em usuario nao apareciam nos seletores de
-- mecanico/atendente, que leem funcionario_publico. A vinculacao e idempotente
-- e usa os valores padrao de comissao da entidade funcionario.
INSERT INTO public.funcionario (nome, cargo, id_usuario, ativo)
SELECT u.nome, u.perfil::text::public.cargo_funcionario, u.id, u.ativo
  FROM public.usuario u
 WHERE u.ativo = true
   AND NOT EXISTS (
   SELECT 1 FROM public.funcionario f WHERE f.id_usuario = u.id
 );

COMMIT;

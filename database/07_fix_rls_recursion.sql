-- =============================================================================
-- SIGAuto - Correcao de recursao nas policies RLS
-- Arquivo: 07_fix_rls_recursion.sql
-- Descricao: Evita "infinite recursion detected in policy" ao consultar apos login
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_perfil_usuario_atual()
RETURNS perfil_usuario
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perfil perfil_usuario;
BEGIN
  SELECT u.perfil
    INTO v_perfil
    FROM public.usuario u
   WHERE u.id = auth.uid()
     AND u.ativo = true
   LIMIT 1;

  RETURN v_perfil;
END;
$$;

-- A policy antiga referenciava cliente dentro da propria policy de cliente.
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
      WHERE v.id_cliente = cliente.id
        AND os.id_mecanico = auth.uid()
    )
  );

-- Evita subselect na propria ordem_servico dentro da policy de UPDATE.
DROP POLICY IF EXISTS pol_os_mecanico_update ON public.ordem_servico;
CREATE POLICY pol_os_mecanico_update ON public.ordem_servico
  FOR UPDATE
  TO authenticated
  USING (
    public.fn_perfil_usuario_atual() = 'mecanico'
    AND id_mecanico = auth.uid()
  )
  WITH CHECK (
    public.fn_perfil_usuario_atual() = 'mecanico'
    AND id_mecanico = auth.uid()
  );

ALTER TABLE IF EXISTS public.servico_catalogo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_servico_catalogo_gestor_all ON public.servico_catalogo;
CREATE POLICY pol_servico_catalogo_gestor_all ON public.servico_catalogo
  FOR ALL
  TO authenticated
  USING (public.fn_perfil_usuario_atual() = 'gestor')
  WITH CHECK (public.fn_perfil_usuario_atual() = 'gestor');

DROP POLICY IF EXISTS pol_servico_catalogo_atendente_select ON public.servico_catalogo;
CREATE POLICY pol_servico_catalogo_atendente_select ON public.servico_catalogo
  FOR SELECT
  TO authenticated
  USING (public.fn_perfil_usuario_atual() = 'atendente');

DROP POLICY IF EXISTS pol_servico_catalogo_atendente_insert ON public.servico_catalogo;
CREATE POLICY pol_servico_catalogo_atendente_insert ON public.servico_catalogo
  FOR INSERT
  TO authenticated
  WITH CHECK (public.fn_perfil_usuario_atual() = 'atendente');

DROP POLICY IF EXISTS pol_servico_catalogo_atendente_update ON public.servico_catalogo;
CREATE POLICY pol_servico_catalogo_atendente_update ON public.servico_catalogo
  FOR UPDATE
  TO authenticated
  USING (public.fn_perfil_usuario_atual() = 'atendente')
  WITH CHECK (public.fn_perfil_usuario_atual() = 'atendente');

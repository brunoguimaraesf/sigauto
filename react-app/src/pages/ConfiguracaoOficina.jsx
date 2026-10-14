import { useEffect, useState } from 'react'
import { Building2, ImageUp, Save, Trash2 } from 'lucide-react'
import { GlassPanel } from '../components/GlassPanel'
import { useDatabase } from '../hooks/useDatabase'
import { maskCNPJ, maskTelefone } from '../utils/masks'
import { UFS, maskCep, cepValido, buscarCep } from '../utils/endereco'
import { validarCNPJ, validarEmail } from '../utils/validacao'

// RF05: dados que identificam a oficina no cabecalho da O.S. em PDF.
// Escrita restrita ao gestor pelo RLS da migracao 18; a rota tambem e de gestor.

const CAMPOS_VAZIOS = {
  nome_fantasia: '', razao_social: '', cnpj: '', telefone: '', email: '',
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
  texto_rodape: '',
}

const formDaOficina = (oficina) => {
  if (!oficina) return CAMPOS_VAZIOS
  const form = { ...CAMPOS_VAZIOS }
  for (const chave of Object.keys(CAMPOS_VAZIOS)) form[chave] = oficina[chave] ?? ''
  form.cnpj = maskCNPJ(form.cnpj)
  form.cep = maskCep(form.cep)
  return form
}

const LIMITE_RODAPE = 300

export function ConfiguracaoOficina() {
  const { oficina, carregandoOficina, erroOficina } = useDatabase()
  // `status` sobrevive ao remount do formulario depois de salvar.
  const [status, setStatus] = useState(null) // { tipo: 'ok' | 'erro', texto }

  return (
    <div className="dashboard-grid">
      <section className="welcome-section stagger-1">
        <h2>Configuração da Oficina</h2>
        <p>Dados que identificam a oficina no cabeçalho da ordem de serviço impressa ou em PDF.</p>
      </section>

      {status && (
        <div
          role={status.tipo === 'erro' ? 'alert' : 'status'}
          className="alert-box"
          style={status.tipo === 'ok' ? { borderColor: 'rgba(16, 185, 129, 0.3)', background: 'rgba(16, 185, 129, 0.05)' } : undefined}
        >
          {status.texto}
        </div>
      )}

      {carregandoOficina ? (
        <GlassPanel className="panel">
          <p style={{ color: 'var(--text-secondary)' }}>Carregando configuração da oficina...</p>
        </GlassPanel>
      ) : (
        <>
          {erroOficina && (
            <div className="alert-box">
              <strong>Não foi possível carregar os dados da oficina.</strong> {erroOficina}
            </div>
          )}
          {!oficina && !erroOficina && (
            <div className="alert-box">
              <strong>Nenhuma oficina cadastrada.</strong> Preencha os dados abaixo: eles saem no cabeçalho de toda O.S. emitida.
            </div>
          )}
          {/* A chave remonta o formulario quando o registro salvo muda. */}
          <FormularioOficina key={oficina?.atualizado_em || 'nova'} oficina={oficina} setStatus={setStatus} />
          <PainelLogo oficina={oficina} setStatus={setStatus} />
        </>
      )}
    </div>
  )
}

function FormularioOficina({ oficina, setStatus }) {
  const { salvarOficina } = useDatabase()
  const [form, setForm] = useState(() => formDaOficina(oficina))
  const [salvando, setSalvando] = useState(false)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [avisoCep, setAvisoCep] = useState('')

  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }))

  // ViaCEP e conveniencia: se nao responder, os campos seguem editaveis.
  const preencherPorCep = async (valor) => {
    setAvisoCep('')
    if (!cepValido(valor)) return
    setBuscandoCep(true)
    const achado = await buscarCep(valor)
    setBuscandoCep(false)
    if (!achado) {
      setAvisoCep('CEP não encontrado. Preencha manualmente.')
      return
    }
    setForm(f => ({
      ...f,
      logradouro: achado.logradouro || f.logradouro,
      bairro: achado.bairro || f.bairro,
      cidade: achado.cidade || f.cidade,
      uf: achado.uf || f.uf,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus(null)
    if (!form.nome_fantasia.trim()) return setStatus({ tipo: 'erro', texto: 'Informe o nome fantasia da oficina.' })
    if (!validarCNPJ(form.cnpj)) return setStatus({ tipo: 'erro', texto: 'CNPJ inválido. Confira o número informado.' })
    if (form.email.trim() && !validarEmail(form.email)) return setStatus({ tipo: 'erro', texto: 'E-mail inválido.' })
    if (form.cep && !cepValido(form.cep)) return setStatus({ tipo: 'erro', texto: 'CEP deve ter 8 dígitos.' })

    setSalvando(true)
    try {
      // O provider normaliza (so digitos, UF maiuscula, opcionais nulos) e
      // preserva o logo atual.
      await salvarOficina({ ...form, logo_path: oficina?.logo_path ?? null })
      setStatus({ tipo: 'ok', texto: 'Dados da oficina salvos.' })
    } catch (err) {
      setStatus({ tipo: 'erro', texto: `Erro ao salvar: ${err?.message || 'tente novamente.'}` })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <GlassPanel className="panel stagger-2">
      <form onSubmit={handleSubmit} noValidate>
        <div className="panel-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Building2 size={20} color="var(--neon-orange)" /> Identificação
          </h3>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="of-nome">Nome fantasia *</label>
            <input id="of-nome" className="form-control" maxLength={120} value={form.nome_fantasia} onChange={e => set('nome_fantasia', e.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor="of-razao">Razão social</label>
            <input id="of-razao" className="form-control" maxLength={160} value={form.razao_social} onChange={e => set('razao_social', e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="of-cnpj">CNPJ *</label>
            <input id="of-cnpj" className="form-control" inputMode="numeric" placeholder="00.000.000/0000-00" value={form.cnpj} onChange={e => set('cnpj', maskCNPJ(e.target.value))} required />
          </div>
          <div className="form-group">
            <label htmlFor="of-telefone">Telefone</label>
            <input id="of-telefone" className="form-control" inputMode="tel" placeholder="(00) 0000-0000" value={form.telefone} onChange={e => set('telefone', maskTelefone(e.target.value))} />
          </div>
          <div className="form-group">
            <label htmlFor="of-email">E-mail</label>
            <input id="of-email" type="email" className="form-control" maxLength={160} value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
        </div>

        <div className="panel-header" style={{ marginTop: '8px' }}>
          <h3>Endereço</h3>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="of-cep">CEP</label>
            <input
              id="of-cep"
              className="form-control"
              inputMode="numeric"
              placeholder="00000-000"
              value={form.cep}
              onChange={e => {
                const valor = maskCep(e.target.value)
                set('cep', valor)
                if (cepValido(valor)) preencherPorCep(valor)
              }}
              aria-describedby="of-cep-aviso"
            />
            <span id="of-cep-aviso" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {buscandoCep ? 'Buscando endereço…' : avisoCep}
            </span>
          </div>
          <div className="form-group" style={{ gridColumn: 'span 2' }}>
            <label htmlFor="of-logradouro">Logradouro</label>
            <input id="of-logradouro" className="form-control" maxLength={160} value={form.logradouro} onChange={e => set('logradouro', e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="of-numero">Número</label>
            <input id="of-numero" className="form-control" maxLength={20} value={form.numero} onChange={e => set('numero', e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="of-complemento">Complemento</label>
            <input id="of-complemento" className="form-control" maxLength={100} value={form.complemento} onChange={e => set('complemento', e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="of-bairro">Bairro</label>
            <input id="of-bairro" className="form-control" maxLength={100} value={form.bairro} onChange={e => set('bairro', e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="of-cidade">Cidade</label>
            <input id="of-cidade" className="form-control" maxLength={100} value={form.cidade} onChange={e => set('cidade', e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="of-uf">UF</label>
            <select id="of-uf" className="form-control" value={form.uf} onChange={e => set('uf', e.target.value)}>
              <option value="">Selecione...</option>
              {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="of-rodape">Texto do rodapé da O.S.</label>
          <textarea
            id="of-rodape"
            className="form-control"
            maxLength={LIMITE_RODAPE}
            placeholder="Ex.: garantia, horário de funcionamento, observações para o cliente"
            value={form.texto_rodape}
            onChange={e => set('texto_rodape', e.target.value)}
          />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', alignSelf: 'flex-end' }}>
            {form.texto_rodape.length}/{LIMITE_RODAPE}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn-primary" disabled={salvando} style={{ borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Save size={16} /> {salvando ? 'Salvando...' : 'Salvar dados'}
          </button>
        </div>
      </form>
    </GlassPanel>
  )
}

function PainelLogo({ oficina, setStatus }) {
  const { uploadLogoOficina, removerLogoOficina, baixarLogoOficina } = useDatabase()
  const [previa, setPrevia] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const logoPath = oficina?.logo_path || null

  // Bucket privado: a previa vem do Blob baixado com a sessao do usuario,
  // num object URL local que e revogado ao trocar de logo.
  useEffect(() => {
    if (!logoPath || typeof URL.createObjectURL !== 'function') return undefined
    let url = null
    let ativo = true
    baixarLogoOficina(logoPath)
      .then(blob => {
        if (!ativo || !blob) return
        url = URL.createObjectURL(blob)
        setPrevia(url)
      })
      .catch(() => { if (ativo) setPrevia(null) })
    return () => {
      ativo = false
      if (url) URL.revokeObjectURL(url)
      setPrevia(null)
    }
  }, [logoPath, baixarLogoOficina])

  const handleArquivo = async (e) => {
    const arquivo = e.target.files?.[0]
    e.target.value = '' // permite escolher o mesmo arquivo de novo
    if (!arquivo) return
    setStatus(null)
    setEnviando(true)
    try {
      await uploadLogoOficina(arquivo)
      setStatus({ tipo: 'ok', texto: 'Logotipo atualizado.' })
    } catch (err) {
      setStatus({ tipo: 'erro', texto: err?.message || 'Não foi possível enviar o logotipo.' })
    } finally {
      setEnviando(false)
    }
  }

  const handleRemover = async () => {
    if (!logoPath) return
    setStatus(null)
    setEnviando(true)
    try {
      await removerLogoOficina(logoPath)
      setStatus({ tipo: 'ok', texto: 'Logotipo removido. A O.S. sairá apenas com o nome da oficina.' })
    } catch (err) {
      setStatus({ tipo: 'erro', texto: err?.message || 'Não foi possível remover o logotipo.' })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <GlassPanel className="panel stagger-3">
      <div className="panel-header">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ImageUp size={20} color="var(--neon-orange)" /> Logotipo
        </h3>
      </div>

      <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{
          width: '160px', height: '96px', borderRadius: 'var(--radius-sm)',
          border: '1px dashed var(--border-highlight)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          background: 'rgba(255, 255, 255, 0.02)', flexShrink: 0,
        }}>
          {previa
            ? <img src={previa} alt={`Logotipo de ${oficina?.nome_fantasia || 'oficina'}`} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            : <span style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '8px' }}>{logoPath ? 'Carregando...' : 'Sem logotipo'}</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minWidth: '220px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            PNG, JPEG ou WebP, até 2 MB. {!oficina && 'Salve os dados da oficina antes de enviar o logotipo.'}
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <label
              htmlFor="of-logo"
              className="btn-secondary"
              style={{
                borderRadius: 'var(--radius-sm)', padding: '8px 16px', cursor: oficina && !enviando ? 'pointer' : 'not-allowed',
                opacity: oficina && !enviando ? 1 : 0.5,
              }}
            >
              {enviando ? 'Enviando...' : logoPath ? 'Trocar logotipo' : 'Enviar logotipo'}
            </label>
            <input
              id="of-logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label="Enviar logotipo"
              onChange={handleArquivo}
              disabled={!oficina || enviando}
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
            />
            {logoPath && (
              <button type="button" className="btn-danger" onClick={handleRemover} disabled={enviando} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Trash2 size={14} /> Remover
              </button>
            )}
          </div>
        </div>
      </div>
    </GlassPanel>
  )
}

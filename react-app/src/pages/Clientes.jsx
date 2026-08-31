import { useState } from 'react'
import { GlassPanel } from '../components/GlassPanel'
import { useDatabase } from '../hooks/useDatabase'
import { Plus, Search, Trash2, Edit2, X, Car } from 'lucide-react'
import { maskCpfCnpj, maskTelefone } from '../utils/masks'
import { UFS, maskCep, cepValido, buscarCep, formatarEndereco } from '../utils/endereco'
import { validarCpfCnpj, validarEmail } from '../utils/validacao'

const enderecoEmBranco = {
  cep: '', logradouro: '', numero: '', complemento: '',
  bairro: '', cidade: '', uf: '', ponto_referencia: '',
}

export function Clientes() {
  const {
    clientes,
    veiculos,
    loading,
    databaseError,
    addCliente,
    updateCliente,
    deleteCliente
  } = useDatabase()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)

  // Estados dos inputs do formulário
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [tipoPessoa, setTipoPessoa] = useState('fisica')
  const [endereco, setEndereco] = useState(enderecoEmBranco)
  // Texto livre do cadastro antigo. Continua visivel enquanto o cliente nao
  // tiver endereco estruturado, para nao sumir com o que ja estava la.
  const [enderecoLegado, setEnderecoLegado] = useState('')
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [erroCep, setErroCep] = useState('')

  // Filtro de busca
  const [searchFilter, setSearchFilter] = useState('')

  const setCampoEndereco = (campo, valor) => setEndereco(e => ({ ...e, [campo]: valor }))

  // Preenche logradouro/bairro/cidade/UF pelo CEP. Se o ViaCEP nao responder, o
  // aviso e discreto e os campos seguem editaveis: digitar na mao sempre vale.
  const handleBuscarCep = async (valor) => {
    setErroCep('')
    if (!cepValido(valor)) return
    setBuscandoCep(true)
    const achado = await buscarCep(valor)
    setBuscandoCep(false)
    if (!achado) {
      setErroCep('CEP nao encontrado. Preencha manualmente.')
      return
    }
    setEndereco(e => ({
      ...e,
      logradouro: achado.logradouro || e.logradouro,
      bairro: achado.bairro || e.bairro,
      cidade: achado.cidade || e.cidade,
      uf: achado.uf || e.uf,
    }))
  }

  // Modal para criar
  const handleOpenAdd = () => {
    setEditingId(null)
    setNome('')
    setEmail('')
    setTelefone('')
    setCpfCnpj('')
    setTipoPessoa('fisica')
    setEndereco(enderecoEmBranco)
    setEnderecoLegado('')
    setErroCep('')
    setModalOpen(true)
  }

  // Modal para editar
  const handleOpenEdit = (c) => {
    setEditingId(c.id)
    setNome(c.nome || '')
    setEmail(c.email || '')
    setTelefone(c.telefone || '')
    setCpfCnpj(c.cpf_cnpj || '')
    setTipoPessoa(c.tipo_pessoa || 'fisica')
    setEndereco({ ...enderecoEmBranco, ...(c.endereco_estruturado || {}) })
    setEnderecoLegado(c.endereco || '')
    setErroCep('')
    setModalOpen(true)
  }

  // Submissão do formulário (Criar/Editar)
  const handleSubmit = (e) => {
    e.preventDefault()

    // Validação de formato no próprio caminho de escrita (o app grava direto no
    // Supabase). Campos opcionais só são checados quando preenchidos.
    if (!nome.trim()) { alert('Informe o nome do cliente.'); return }
    if (cpfCnpj.trim() && !validarCpfCnpj(cpfCnpj, tipoPessoa)) {
      alert(`${tipoPessoa === 'juridica' ? 'CNPJ' : 'CPF'} inválido. Confira o número informado.`)
      return
    }
    if (email.trim() && !validarEmail(email)) { alert('E-mail inválido.'); return }

    const payload = {
      nome,
      email,
      telefone,
      cpf_cnpj: cpfCnpj,
      tipo_pessoa: tipoPessoa,
      endereco: enderecoLegado,
      endereco_estruturado: endereco
    }

    if (editingId) {
      updateCliente(editingId, payload)
    } else {
      addCliente(payload)
    }

    setModalOpen(false)
  }

  // Filtro reativo por nome, e-mail, telefone, documento ou endereco — este
  // ultimo agora alcanca bairro, cidade e CEP, que o texto livre nao permitia.
  const filteredClientes = clientes.filter(c => {
    const term = searchFilter.toLowerCase()
    return (c.nome || '').toLowerCase().includes(term) ||
           (c.email || '').toLowerCase().includes(term) ||
           (c.telefone || '').includes(term) ||
           (c.cpf_cnpj || '').includes(term) ||
           formatarEndereco(c.endereco_estruturado, c.endereco).toLowerCase().includes(term)
  })

  return (
    <div className="dashboard-grid">
      <section className="welcome-section stagger-1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2>Base de Clientes</h2>
          <p>Gerenciamento e diretório de proprietários de veículos cadastrados.</p>
        </div>
        <button className="btn-primary" onClick={handleOpenAdd} style={{ borderRadius: 'var(--radius-sm)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={16} /> Novo Cliente
        </button>
      </section>

      <GlassPanel className="panel stagger-2">
        <div className="panel-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '16px', marginBottom: '24px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Buscar clientes por nome, e-mail, telefone, CPF/CNPJ ou endereço..." 
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{ paddingLeft: '40px' }}
            />
            <Search size={18} color="var(--text-secondary)" style={{ position: 'absolute', left: 16, top: 13 }} />
          </div>
        </div>

        <div className="tech-table-container">
          {databaseError ? (
            <div style={{ color: 'var(--neon-orange)', textAlign: 'center', padding: '24px' }}>
              Falha ao carregar clientes do banco: {databaseError}
            </div>
          ) : loading ? (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '24px' }}>
              Carregando diretório de clientes...
            </div>
          ) : filteredClientes.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '24px' }}>
              Nenhum cliente cadastrado ou correspondente encontrado.
            </div>
          ) : (
            <table className="tech-table">
              <thead>
                <tr>
                  <th>Nome do Cliente</th>
                  <th>Contato (E-mail / Telefone)</th>
                  <th>Veículos</th>
                  <th>Total de Carros</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredClientes.map((c) => {
                  // Filtra carros pertencentes a este cliente proprietário
                  const clientCars = veiculos.filter(v => v.cliente_id === c.id)
                  
                  return (
                    <tr key={c.id}>
                      <td style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(232, 89, 12, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--neon-orange)', fontWeight: 'bold' }}>
                          {c.nome?.charAt(0) || 'C'}
                        </div>
                        <div>
                          <strong style={{ fontSize: '15px' }}>{c.nome}</strong>
                          <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {c.tipo_pessoa === 'juridica' ? 'CNPJ' : 'CPF'}: {c.cpf_cnpj || 'Nao informado'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span style={{ display: 'block', fontSize: '13px', color: 'var(--text-primary)' }}>{c.telefone}</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{c.email}</span>
                        {formatarEndereco(c.endereco_estruturado, c.endereco) && (
                          <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {formatarEndereco(c.endereco_estruturado, c.endereco)}
                          </span>
                        )}
                      </td>
                      <td>
                        {clientCars.length === 0 ? (
                          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Nenhum veículo na garagem</span>
                        ) : (
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {clientCars.map(car => (
                              <span 
                                key={car.id} 
                                style={{ 
                                  padding: '2px 8px', 
                                  background: 'rgba(232, 89, 12, 0.05)', 
                                  border: '1px solid rgba(232, 89, 12, 0.15)', 
                                  borderRadius: 'var(--radius-sm)', 
                                  fontSize: '11px', 
                                  color: 'var(--neon-orange)',
                                  fontWeight: '600',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title={`${car.marca} ${car.modelo}`}
                              >
                                <Car size={10} /> {car.placa}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ fontFamily: 'var(--font-display)', fontWeight: '600', fontSize: '15px' }}>
                        {clientCars.length}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button 
                            className="btn-secondary" 
                            onClick={() => handleOpenEdit(c)}
                            style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Edit2 size={12} /> Editar
                          </button>
                          <button 
                            className="btn-danger" 
                            onClick={() => {
                              if (confirm(`Tem certeza que deseja excluir o cliente ${c.nome}?`)) {
                                deleteCliente(c.id)
                              }
                            }}
                            style={{ padding: '6px' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </GlassPanel>

      {/* --- MODAL DE CRIAÇÃO/EDIÇÃO --- */}
      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{editingId ? 'Editar Dados do Cliente' : 'Cadastrar Novo Proprietário'}</h3>
              <button onClick={() => setModalOpen(false)} style={{ color: 'var(--text-secondary)' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Nome Completo</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ex: Ayrton Senna da Silva"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Tipo de Pessoa</label>
                    <select
                      className="form-control"
                      value={tipoPessoa}
                      onChange={(e) => setTipoPessoa(e.target.value)}
                    >
                      <option value="fisica">Pessoa Física</option>
                      <option value="juridica">Pessoa Jurídica</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>{tipoPessoa === 'juridica' ? 'CNPJ' : 'CPF'}</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder={tipoPessoa === 'juridica' ? '12.345.678/0001-99' : '123.456.789-00'}
                      value={cpfCnpj}
                      onChange={(e) => setCpfCnpj(maskCpfCnpj(e.target.value, tipoPessoa))}
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>E-mail de Contato</label>
                    <input
                      type="email"
                      className="form-control"
                      placeholder="Ex: senna@mclaren.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Telefone Celular</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="(11) 99876-5432"
                      value={telefone}
                      onChange={(e) => setTelefone(maskTelefone(e.target.value))}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Endereço</label>

                  <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '12px' }}>
                    <div>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="CEP"
                        inputMode="numeric"
                        value={maskCep(endereco.cep)}
                        onChange={(e) => {
                          const valor = maskCep(e.target.value)
                          setCampoEndereco('cep', valor)
                          if (cepValido(valor)) handleBuscarCep(valor)
                        }}
                        onBlur={(e) => handleBuscarCep(e.target.value)}
                      />
                      {buscandoCep && (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Buscando…</span>
                      )}
                      {erroCep && (
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{erroCep}</span>
                      )}
                    </div>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Logradouro"
                      value={endereco.logradouro}
                      onChange={(e) => setCampoEndereco('logradouro', e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: '12px', marginTop: '12px' }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Número"
                      value={endereco.numero}
                      onChange={(e) => setCampoEndereco('numero', e.target.value)}
                    />
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Complemento"
                      value={endereco.complemento}
                      onChange={(e) => setCampoEndereco('complemento', e.target.value)}
                    />
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Bairro"
                      value={endereco.bairro}
                      onChange={(e) => setCampoEndereco('bairro', e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '12px', marginTop: '12px' }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Cidade"
                      value={endereco.cidade}
                      onChange={(e) => setCampoEndereco('cidade', e.target.value)}
                    />
                    <select
                      className="form-control"
                      value={endereco.uf}
                      onChange={(e) => setCampoEndereco('uf', e.target.value)}
                      aria-label="UF"
                    >
                      <option value="">UF</option>
                      {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                    </select>
                  </div>

                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ponto de referência"
                    style={{ marginTop: '12px' }}
                    value={endereco.ponto_referencia}
                    onChange={(e) => setCampoEndereco('ponto_referencia', e.target.value)}
                  />

                  {enderecoLegado && (
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                      Cadastro anterior: {enderecoLegado}
                    </span>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">{editingId ? 'Salvar Alterações' : 'Confirmar Cadastro'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

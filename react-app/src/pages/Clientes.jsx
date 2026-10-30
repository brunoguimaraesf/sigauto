import { useState } from 'react'
import { GlassPanel } from '../components/GlassPanel'
import { useDatabase } from '../hooks/useDatabase'
import { Plus, Search, UserX, Edit2, X, Car } from 'lucide-react'
import { maskCpfCnpj, maskTelefone } from '../utils/masks'
import { UFS, maskCep, cepValido, buscarCep, formatarEndereco } from '../utils/endereco'
import { validarCpfCnpj, validarEmail } from '../utils/validacao'
import css from './Clientes.module.css'

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
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [erroCep, setErroCep] = useState('')
  const [formSujo, setFormSujo] = useState(false)

  // Filtro de busca
  const [searchFilter, setSearchFilter] = useState('')

  const setCampoEndereco = (campo, valor) => {
    setFormSujo(true)
    setEndereco(e => ({ ...e, [campo]: valor }))
  }

  const fecharModal = () => {
    if (formSujo && !confirm('Descartar as alterações não salvas?')) return
    setModalOpen(false)
    setFormSujo(false)
  }

  // Preenche logradouro/bairro/cidade/UF pelo CEP. Se o ViaCEP nao responder, o
  // aviso e discreto e os campos seguem editaveis: digitar na mao sempre vale.
  const handleBuscarCep = async (valor) => {
    setErroCep('')
    if (!cepValido(valor)) return
    setBuscandoCep(true)
    const achado = await buscarCep(valor)
    setBuscandoCep(false)
    if (!achado) {
      setErroCep('CEP não encontrado. Preencha manualmente.')
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
    setErroCep('')
    setFormSujo(false)
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
    setErroCep('')
    setFormSujo(false)
    setModalOpen(true)
  }

  // Submissão do formulário (Criar/Editar)
  const handleSubmit = (e) => {
    e.preventDefault()

    // Validação de formato no próprio caminho de escrita (o app grava direto no
    // Supabase). Campos opcionais só são checados quando preenchidos.
    if (!nome.trim()) { alert('Informe o nome do cliente.'); return }
    if (!telefone.trim()) { alert('Informe o telefone do cliente.'); return }
    if (cpfCnpj.trim() && !validarCpfCnpj(cpfCnpj, tipoPessoa)) {
      alert(`${tipoPessoa === 'juridica' ? 'CNPJ' : 'CPF'} inválido. Confira o número informado.`)
      return
    }
    if (email.trim() && !validarEmail(email)) { alert('E-mail inválido.'); return }

    const documento = cpfCnpj.replace(/\D/g, '')
    const documentoDuplicado = documento && clientes.some(cliente =>
      cliente.id !== editingId && String(cliente.cpf_cnpj || '').replace(/\D/g, '') === documento
    )
    if (documentoDuplicado) { alert('CPF/CNPJ já cadastrado para outro cliente.'); return }

    const payload = {
      nome: nome.trim(),
      email: email.trim(),
      telefone: telefone.trim(),
      cpf_cnpj: cpfCnpj,
      tipo_pessoa: tipoPessoa,
      endereco_estruturado: endereco
    }

    if (editingId) {
      updateCliente(editingId, payload).catch(err => alert(`Erro ao atualizar cliente: ${err?.message || 'tente novamente.'}`))
    } else {
      addCliente(payload).catch(err => alert(`Erro ao salvar cliente: ${err?.message || 'tente novamente.'}`))
    }

    setFormSujo(false)
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
           formatarEndereco(c.endereco_estruturado).toLowerCase().includes(term)
  })

  return (
    <div className="dashboard-grid">
      <section className={`welcome-section stagger-1 ${css.topo}`}>
        <div>
          <h2>Base de Clientes</h2>
          <p>Gerenciamento e diretório de proprietários de veículos cadastrados.</p>
        </div>
        <button className={`btn-primary ${css.btnNovo}`} onClick={handleOpenAdd}>
          <Plus size={16} /> Novo Cliente
        </button>
      </section>

      <GlassPanel className="panel stagger-2">
        <div className={`panel-header ${css.panelHeader}`}>
          <div className={css.busca}>
            <input 
              type="text" 
              className={`form-control ${css.buscaInput}`}
              placeholder="Buscar clientes por nome, e-mail, telefone, CPF/CNPJ ou endereço..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
            <Search size={18} color="var(--text-secondary)" className={css.buscaIcone} />
          </div>
        </div>

        <div className="tech-table-container">
          {databaseError ? (
            <div className={css.erro}>
              Falha ao carregar clientes do banco: {databaseError}
            </div>
          ) : loading ? (
            <div className={css.aviso}>
              Carregando diretório de clientes...
            </div>
          ) : filteredClientes.length === 0 ? (
            <div className={css.aviso}>
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
                      <td data-label="Cliente">
                        <div className={css.celulaNome}>
                          <div className={css.avatar}>
                            {c.nome?.charAt(0) || 'C'}
                          </div>
                          <div>
                            <strong className={css.nome}>{c.nome}</strong>
                            <span className={css.documento}>
                              {c.tipo_pessoa === 'juridica' ? 'CNPJ' : 'CPF'}: {c.cpf_cnpj || 'Não informado'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td data-label="Contato">
                        <span className={css.telefone}>{c.telefone}</span>
                        <span className={css.email}>{c.email}</span>
                        {formatarEndereco(c.endereco_estruturado) && (
                          <span className={css.endereco}>
                            {formatarEndereco(c.endereco_estruturado)}
                          </span>
                        )}
                      </td>
                      <td data-label="Veículos">
                        {clientCars.length === 0 ? (
                          <span className={css.semVeiculo}>Nenhum veículo na garagem</span>
                        ) : (
                          <div className={css.garagem}>
                            {clientCars.map(car => (
                              <span 
                                key={car.id}
                                className={css.veiculo}
                                title={`${car.marca} ${car.modelo}`}
                              >
                                <Car size={10} /> {car.placa}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td data-label="Carros" className={css.contagem}>
                        {clientCars.length}
                      </td>
                      <td>
                        <div className={css.acoes}>
                          <button
                            className={`btn-secondary ${css.btnAcao}`}
                            onClick={() => handleOpenEdit(c)}
                          >
                            <Edit2 size={12} /> Editar
                          </button>
                          <button 
                            type="button"
                            className={`btn-danger ${css.btnIcone}`}
                            aria-label={`Inativar cliente ${c.nome}`}
                            title="Inativar cliente"
                            onClick={() => {
                              if (confirm(`Tem certeza que deseja inativar o cliente ${c.nome}?`)) {
                                deleteCliente(c.id).catch(err => {
                                  alert(`Não foi possível inativar o cliente: ${err?.message || 'erro desconhecido'}`)
                                })
                              }
                            }}
                          >
                            <UserX size={14} />
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
              <button
                type="button"
                onClick={fecharModal}
                className={css.btnFechar}
                aria-label="Fechar formulário de cliente"
                title="Fechar formulário"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <p className={css.legendaObrigatorios}>* Campos obrigatórios</p>
                <div className="form-group">
                  <label htmlFor="cliente-nome">Nome Completo *</label>
                  <input
                    id="cliente-nome"
                    type="text"
                    className="form-control"
                    placeholder="Ex: Ayrton Senna da Silva"
                    value={nome}
                    onChange={(e) => { setNome(e.target.value); setFormSujo(true) }}
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="cliente-tipo-pessoa">Tipo de Pessoa</label>
                    <select
                      id="cliente-tipo-pessoa"
                      className="form-control"
                      value={tipoPessoa}
                      onChange={(e) => { setTipoPessoa(e.target.value); setFormSujo(true) }}
                    >
                      <option value="fisica">Pessoa Física</option>
                      <option value="juridica">Pessoa Jurídica</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="cliente-documento">{tipoPessoa === 'juridica' ? 'CNPJ *' : 'CPF *'}</label>
                    <input
                      id="cliente-documento"
                      type="text"
                      className="form-control"
                      placeholder={tipoPessoa === 'juridica' ? '12.345.678/0001-99' : '123.456.789-00'}
                      value={cpfCnpj}
                      onChange={(e) => { setCpfCnpj(maskCpfCnpj(e.target.value, tipoPessoa)); setFormSujo(true) }}
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="cliente-email">E-mail de Contato</label>
                    <input
                      id="cliente-email"
                      type="email"
                      className="form-control"
                      placeholder="Ex: senna@mclaren.com"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setFormSujo(true) }}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="cliente-telefone">Telefone Celular *</label>
                    <input
                      id="cliente-telefone"
                      type="text"
                      className="form-control"
                      placeholder="(11) 99876-5432"
                      value={telefone}
                      onChange={(e) => { setTelefone(maskTelefone(e.target.value)); setFormSujo(true) }}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Endereço</label>

                  <div className={css.linhaCep}>
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
                        <span className={css.dicaCep}>Buscando…</span>
                      )}
                      {erroCep && (
                        <span className={css.statusCep}>{erroCep}</span>
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

                  <div className={css.linhaNumero}>
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

                  <div className={css.linhaCidade}>
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
                    className={`form-control ${css.campoReferencia}`}
                    placeholder="Ponto de referência"
                    value={endereco.ponto_referencia}
                    onChange={(e) => setCampoEndereco('ponto_referencia', e.target.value)}
                  />

                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={fecharModal}>Cancelar</button>
                <button type="submit" className="btn-primary">{editingId ? 'Salvar Alterações' : 'Confirmar Cadastro'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

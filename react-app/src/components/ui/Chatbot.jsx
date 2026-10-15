import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Bot, User, Trash2, CloudOff } from 'lucide-react'
import css from './Chatbot.module.css'

// Texto único de indisponibilidade. Não há resposta local de substituição: se a
// IA não responde, o assistente diz isso e não inventa orientação. Constante
// para que a UI e os testes não derivem um do outro.
export const MSG_IA_INDISPONIVEL =
  'A IA está indisponível no momento. Nenhuma resposta foi gerada — tente novamente em alguns instantes.'

const SAUDACAO = {
  id: 'init',
  remetente: 'chatbot',
  conteudo: 'Olá! Sou o assistente do SIGAuto. Posso ajudar com dúvidas sobre ordens de serviço, estoque, cadastros, e processos da oficina. Como posso ajudar?',
  criado_em: new Date().toISOString(),
}

const RESPOSTAS_RAPIDAS = [
  'Como abrir uma nova OS?',
  'Como registrar entrada de peça?',
  'Como encerrar uma OS?',
  'Como inativar um cliente?',
  'Como cadastrar um veículo?',
  'Como ver os relatórios?',
]

export function Chatbot() {
  const [aberto, setAberto] = useState(false)
  const [mensagens, setMensagens] = useState([SAUDACAO])
  const [input, setInput] = useState('')
  const [enviando, setEnviando] = useState(false)
  const endRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  useEffect(() => {
    if (aberto) setTimeout(() => inputRef.current?.focus(), 100)
  }, [aberto])

  // Fechar com Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const enviar = async (texto) => {
    const pergunta = (texto || input).trim()
    if (!pergunta) return
    setInput('')

    // Historico = apenas a conversa visivel desta sessao (exclui a saudacao
    // inicial). Isso mantem o contexto do Gemini alinhado ao que o usuario ve.
    const historicoSessao = mensagens
      .filter(m => m.id !== 'init')
      .map(m => ({ remetente: m.remetente, conteudo: m.conteudo }))

    const msgUser = { id: crypto.randomUUID(), remetente: 'usuario', conteudo: pergunta, criado_em: new Date().toISOString() }
    setMensagens(m => [...m, msgUser])
    setEnviando(true)

    try {
      const { chatbotApi } = await import('../../services/api.js')
      const data = await chatbotApi.enviarMensagem(pergunta, historicoSessao)
      const resposta = data?.dados?.resposta || data?.resposta || data?.mensagem
      // Um 200 com corpo fora do contrato (ou com texto vazio) não lança por si:
      // sem esta checagem, entrava uma bolha em branco, sem aviso nenhum, que o
      // usuário lê como assistente quebrado. Jogar para o `catch` unifica o
      // tratamento com o da falha de rede.
      if (!resposta?.trim()) throw new Error('resposta vazia da IA')
      setMensagens(m => [...m, { id: crypto.randomUUID(), remetente: 'chatbot', conteudo: resposta, criado_em: new Date().toISOString() }])
    } catch (e) {
      console.error('[Chatbot] IA indisponível. Causa:', e?.status, e?.data?.codigo || e?.message, e)
      // `indisponivel: true` muda a aparência da bolha; o conteúdo é o aviso, não
      // uma resposta de mentira.
      setMensagens(m => [...m, {
        id: crypto.randomUUID(),
        remetente: 'chatbot',
        conteudo: MSG_IA_INDISPONIVEL,
        criado_em: new Date().toISOString(),
        indisponivel: true,
      }])
    } finally {
      setEnviando(false)
    }
  }

  const limparConversa = () => {
    setMensagens([SAUDACAO])
  }

  // Formata a resposta com seguranca: escapa HTML primeiro (evita XSS na
  // insercao via dangerouslySetInnerHTML) e depois aplica negrito, listas e
  // quebras de linha.
  const renderTexto = (texto) => {
    const escapar = (s) => String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const inline = (s) => escapar(s).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    return String(texto || '')
      .split('\n')
      .map(linha => {
        const item = linha.match(/^\s*[-*]\s+(.*)/)
        return item ? `&nbsp;&nbsp;•&nbsp;${inline(item[1])}` : inline(linha)
      })
      .join('<br>')
  }

  const totalMsgs = mensagens.length - 1
  // O status da sidebar precisa concordar com as bolhas. Antes era o literal
  // "Online" em verde, fixo: a bolha dizia "IA indisponível" e, a 20 px dali, um
  // ponto verde afirmava o contrário — e o usuário acredita no ponto verde.
  //
  // Olha a ÚLTIMA resposta, não o histórico: se a IA voltou a responder, o status
  // volta a "Online". Com `some()` ele ficaria presa em indisponível para sempre,
  // contradizendo a resposta boa que acabou de chegar.
  const iaIndisponivel = mensagens.filter(m => m.remetente === 'chatbot').at(-1)?.indisponivel === true

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setAberto(v => !v)}
        aria-label={aberto ? 'Fechar assistente' : 'Abrir assistente'}
        aria-expanded={aberto}
        title={aberto ? 'Fechar assistente' : 'Abrir assistente'}
        className={aberto ? `${css.fab} ${css.fabOpen}` : css.fab}
      >
        {aberto
          ? <X size={22} color="var(--text-secondary)" />
          : <MessageCircle size={22} color="#fff" />
        }
      </button>

      {/* Overlay + Modal */}
      {aberto && (
        <div
          onClick={e => e.target === e.currentTarget && setAberto(false)}
          className={css.overlay}
        >
          <div className={css.janela}>

            {/* ── Sidebar esquerda ── */}
            <div className={css.lateral}>
              {/* Gradiente top */}
              <div className={css.filete} />

              {/* Info do bot */}
              <div className={css.lateralTopo}>
                <div className={css.avatarIA}>
                  <Bot size={24} color="var(--neon-orange)" />
                </div>
                <div className={css.nomeIA}>Assistente SIGAuto</div>
                <div className={`${css.statusIA}${iaIndisponivel ? ` ${css.statusIndisponivel}` : ''}`}>
                  <span className={`${css.statusPonto}${iaIndisponivel ? ` ${css.statusPontoIndisponivel}` : ''}`} />
                  {iaIndisponivel ? 'IA indisponível' : 'Online'}
                </div>
                <p className={css.descricaoIA}>
                  Suporte operacional para o sistema de gestão automotiva.
                </p>
              </div>

              {/* Ações rápidas */}
              <div className={css.sugestoesArea}>
                <div className={css.sugestoesTitulo}>
                  Perguntas rápidas
                </div>
                <div className={css.sugestoesLista}>
                  {RESPOSTAS_RAPIDAS.map(r => (
                    <button
                      key={r}
                      onClick={() => enviar(r)}
                      className={css.suggestion}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rodapé sidebar */}
              <div className={css.rodapeLateral}>
                <button
                  onClick={limparConversa}
                  className={css.clearBtn}
                >
                  <Trash2 size={13} /> Limpar conversa
                </button>
              </div>
            </div>

            {/* ── Área de chat ── */}
            <div className={css.areaChat}>

              {/* Header do chat */}
              <div className={css.divisor} />
              <div className={css.headerChat}>
                <div className={css.contador}>
                  {totalMsgs === 0
                    ? 'Nenhuma mensagem ainda'
                    : <><span className={css.contadorForte}>{totalMsgs}</span> {totalMsgs === 1 ? 'mensagem' : 'mensagens'}</>
                  }
                </div>
                <button
                  onClick={() => setAberto(false)}
                  aria-label="Fechar assistente (Esc)"
                  title="Fechar (Esc)"
                  className={css.closeBtn}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Mensagens.
                  `role="log"` + `aria-live="polite"` é o que faz a resposta (e o
                  aviso de indisponibilidade) ser anunciada por leitor de tela: ela
                  chega depois de um await, e sem região viva o usuário fica
                  esperando sem saber que chegou. A região vive no CONTÊINER, não na
                  bolha — região criada já populada frequentemente não anuncia. */}
              <div
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                aria-label="Conversa com o assistente"
                className={css.mensagens}
              >
                {mensagens.map(msg => (
                  <div key={msg.id} className={`${css.mensagem}${msg.remetente === 'usuario' ? ` ${css.mensagemUsuario}` : ''}`}>
                    <div className={`${css.avatarMsg}${msg.remetente === 'usuario' ? ` ${css.avatarMsgUsuario}` : ''}`}>
                      {msg.remetente === 'usuario'
                        ? <User size={15} color="#fff" />
                        : <Bot size={15} color="var(--neon-orange)" />
                      }
                    </div>
                    <div className={`${css.bolha}${msg.remetente === 'usuario' ? ` ${css.bolhaUsuario}` : ''}`}>
                      {/* A bolha de indisponibilidade NÃO carrega resposta: ela é o
                          aviso. O rótulo fica no DOM, visível — antes a única frase
                          acionável vivia num `title`, inalcançável por teclado, por
                          toque e por leitor de tela (no cálculo de nome acessível o
                          conteúdo de texto vence o atributo, que é descartado). */}
                      {msg.indisponivel && (
                        <div className={css.avisoIndisponivel}>
                          <CloudOff size={14} color="var(--color-warning)" className={css.avisoIcone} />
                          IA indisponível
                        </div>
                      )}
                      <span dangerouslySetInnerHTML={{ __html: renderTexto(msg.conteudo) }} />
                      <div className={`${css.horario}${msg.remetente === 'usuario' ? ` ${css.horarioUsuario}` : ''}`}>
                        {new Date(msg.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Indicador de digitação */}
                {enviando && (
                  <div className={css.digitando}>
                    <div className={css.avatarDigitando}>
                      <Bot size={15} color="var(--neon-orange)" />
                    </div>
                    <div className={css.bolhaDigitando}>
                      <div className={css.pontos}>
                        {[0, 1, 2].map(i => (
                          <span
                            key={i}
                            className={css.ponto}
                            style={{ animation: `pulse-glow 1.2s ease-in-out ${i * 0.2}s infinite` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div ref={endRef} />
              </div>

              {/* Input */}
              <div className={css.barraEnvio}>
                <input
                  ref={inputRef}
                  type="text"
                  className={`form-control ${css.campoEnvio}`}
                  placeholder="Digite sua dúvida e pressione Enter..."
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviar()}
                  disabled={enviando}
                />
                <button
                  onClick={() => enviar()}
                  disabled={enviando || !input.trim()}
                  className={`${css.btnEnviar}${input.trim() ? ` ${css.btnEnviarAtivo}` : ''}`}
                >
                  <Send size={16} color={input.trim() ? '#fff' : 'var(--text-muted)'} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

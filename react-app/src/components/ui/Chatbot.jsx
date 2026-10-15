import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Bot, User, Trash2, CloudOff } from 'lucide-react'

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
        style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000,
          width: '56px', height: '56px', borderRadius: '50%',
          background: aberto
            ? 'var(--bg-subtle)'
            : 'var(--color-primary)',
          boxShadow: aberto
            ? 'var(--shadow-md)'
            : '0 4px 20px var(--color-primary-tint)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s ease',
          border: aberto ? '1px solid var(--border-color)' : 'none',
          cursor: 'pointer',
        }}
        onMouseEnter={e => { if (!aberto) { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 6px 28px var(--color-primary-ring)' } }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = aberto ? 'var(--shadow-md)' : 'var(--shadow-md)' }}
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
          style={{
            position: 'fixed', inset: 0, zIndex: 999,
            background: 'rgba(16, 24, 40, 0.45)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
            animation: 'overlayIn 0.15s ease',
          }}
        >
          <div style={{
            width: 'min(880px, 96vw)',
            height: 'min(700px, 88vh)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--color-primary-border)',
            borderRadius: '16px',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            overflow: 'hidden',
            animation: 'scaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
          }}>

            {/* ── Sidebar esquerda ── */}
            <div style={{
              width: '230px', flexShrink: 0,
              borderRight: '1px solid var(--border-color)',
              display: 'flex', flexDirection: 'column',
              background: 'var(--bg-subtle)',
            }}>
              {/* Gradiente top */}
              <div style={{ height: '2px', background: 'var(--color-primary)' }} />

              {/* Info do bot */}
              <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{
                  width: '52px', height: '52px', borderRadius: '50%',
                  background: 'radial-gradient(circle, var(--color-primary-tint), var(--color-primary))',
                  border: '1px solid var(--color-primary-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '12px',
                }}>
                  <Bot size={24} color="var(--neon-orange)" />
                </div>
                <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>Assistente SIGAuto</div>
                <div style={{
                  fontSize: '11px',
                  color: iaIndisponivel ? 'var(--status-pending)' : 'var(--status-done)',
                  display: 'flex', alignItems: 'center', gap: '5px', marginTop: '5px',
                }}>
                  <span style={{
                    width: '6px', height: '6px', borderRadius: '50%', display: 'inline-block',
                    background: iaIndisponivel ? 'var(--status-pending)' : 'var(--status-done)',
                  }} />
                  {iaIndisponivel ? 'IA indisponível' : 'Online'}
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px', lineHeight: '1.55' }}>
                  Suporte operacional para o sistema de gestão automotiva.
                </p>
              </div>

              {/* Ações rápidas */}
              <div style={{ padding: '14px 16px', flex: 1, overflowY: 'auto' }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>
                  Perguntas rápidas
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {RESPOSTAS_RAPIDAS.map(r => (
                    <button
                      key={r}
                      onClick={() => enviar(r)}
                      style={{
                        width: '100%', textAlign: 'left',
                        padding: '8px 10px',
                        background: 'var(--color-primary-tint)',
                        border: '1px solid var(--color-primary-border)',
                        borderRadius: '8px', fontSize: '12px',
                        color: 'var(--text-secondary)', cursor: 'pointer',
                        fontFamily: 'var(--font-body)', lineHeight: '1.4',
                        transition: 'all 0.12s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-primary-tint)'; e.currentTarget.style.color = 'var(--neon-orange)'; e.currentTarget.style.borderColor = 'var(--color-primary)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-primary-tint)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--color-primary)' }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rodapé sidebar */}
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-color)' }}>
                <button
                  onClick={limparConversa}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '7px 10px', background: 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px', fontSize: '12px',
                    color: 'var(--text-muted)', cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-danger)'; e.currentTarget.style.borderColor = 'var(--color-danger)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--text-secondary)' }}
                >
                  <Trash2 size={13} /> Limpar conversa
                </button>
              </div>
            </div>

            {/* ── Área de chat ── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

              {/* Header do chat */}
              <div style={{ height: '2px', background: 'var(--border-color)' }} />
              <div style={{
                padding: '14px 20px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexShrink: 0,
              }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {totalMsgs === 0
                    ? 'Nenhuma mensagem ainda'
                    : <><span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{totalMsgs}</span> {totalMsgs === 1 ? 'mensagem' : 'mensagens'}</>
                  }
                </div>
                <button
                  onClick={() => setAberto(false)}
                  aria-label="Fechar assistente (Esc)"
                  title="Fechar (Esc)"
                  style={{
                    color: 'var(--text-muted)', background: 'transparent', border: 'none',
                    cursor: 'pointer', padding: '6px', borderRadius: '8px',
                    display: 'flex', alignItems: 'center',
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-subtle)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}
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
                style={{
                  flex: 1, overflowY: 'auto',
                  padding: '20px 24px',
                  display: 'flex', flexDirection: 'column', gap: '16px',
                }}
              >
                {mensagens.map(msg => (
                  <div key={msg.id} style={{ display: 'flex', gap: '10px', flexDirection: msg.remetente === 'usuario' ? 'row-reverse' : 'row' }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0, marginTop: '2px',
                      background: msg.remetente === 'usuario'
                        ? 'var(--color-primary)'
                        : 'var(--color-primary-tint)',
                      border: msg.remetente === 'chatbot' ? '1px solid var(--color-primary-border)' : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {msg.remetente === 'usuario'
                        ? <User size={15} color="#fff" />
                        : <Bot size={15} color="var(--neon-orange)" />
                      }
                    </div>
                    <div style={{
                      maxWidth: '72%',
                      padding: '12px 16px',
                      borderRadius: msg.remetente === 'usuario' ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
                      background: msg.remetente === 'usuario'
                        ? 'var(--color-danger)'
                        : 'var(--bg-subtle)',
                      border: `1px solid ${msg.remetente === 'usuario' ? 'var(--color-primary-border)' : 'var(--border-color)'}`,
                      fontSize: '14px', lineHeight: '1.6', color: 'var(--text-primary)',
                    }}>
                      {/* A bolha de indisponibilidade NÃO carrega resposta: ela é o
                          aviso. O rótulo fica no DOM, visível — antes a única frase
                          acionável vivia num `title`, inalcançável por teclado, por
                          toque e por leitor de tela (no cálculo de nome acessível o
                          conteúdo de texto vence o atributo, que é descartado). */}
                      {msg.indisponivel && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          marginBottom: '8px', paddingBottom: '8px',
                          borderBottom: '1px solid var(--border-color)',
                          fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)',
                        }}>
                          <CloudOff size={14} color="var(--color-warning)" style={{ flexShrink: 0 }} />
                          IA indisponível
                        </div>
                      )}
                      <span dangerouslySetInnerHTML={{ __html: renderTexto(msg.conteudo) }} />
                      <div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--text-muted)', textAlign: msg.remetente === 'usuario' ? 'right' : 'left' }}>
                        {new Date(msg.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Indicador de digitação */}
                {enviando && (
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%',
                      background: 'var(--color-primary-tint)', border: '1px solid var(--color-primary-border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Bot size={15} color="var(--neon-orange)" />
                    </div>
                    <div style={{
                      padding: '12px 16px',
                      background: 'var(--bg-subtle)',
                      borderRadius: '4px 14px 14px 14px',
                      border: '1px solid var(--border-color)',
                    }}>
                      <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                        {[0, 1, 2].map(i => (
                          <span
                            key={i}
                            style={{
                              width: '7px', height: '7px', borderRadius: '50%',
                              background: 'var(--text-secondary)', display: 'inline-block',
                              animation: `pulse-glow 1.2s ease-in-out ${i * 0.2}s infinite`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div ref={endRef} />
              </div>

              {/* Input */}
              <div style={{
                padding: '14px 20px',
                borderTop: '1px solid var(--border-color)',
                display: 'flex', gap: '10px', flexShrink: 0,
                background: 'var(--bg-subtle)',
              }}>
                <input
                  ref={inputRef}
                  type="text"
                  className="form-control"
                  placeholder="Digite sua dúvida e pressione Enter..."
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviar()}
                  disabled={enviando}
                  style={{ flex: 1, fontSize: '14px', padding: '10px 14px' }}
                />
                <button
                  onClick={() => enviar()}
                  disabled={enviando || !input.trim()}
                  style={{
                    width: '44px', height: '44px', borderRadius: '10px',
                    background: input.trim()
                      ? 'var(--color-primary)'
                      : 'var(--bg-subtle)',
                    border: '1px solid var(--color-primary-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: input.trim() ? 'pointer' : 'not-allowed',
                    flexShrink: 0, transition: 'all 0.15s',
                  }}
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

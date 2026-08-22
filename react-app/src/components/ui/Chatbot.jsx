import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Bot, User, Trash2 } from 'lucide-react'
import { buscarResposta } from '../../utils/chatbot'

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

    const msgUser = { id: crypto.randomUUID(), remetente: 'usuario', conteudo: pergunta, criado_em: new Date().toISOString() }
    setMensagens(m => [...m, msgUser])
    setEnviando(true)

    try {
      const { chatbotApi } = await import('../../services/api.js')
      const data = await chatbotApi.enviarMensagem(pergunta)
      const resposta = data?.dados?.resposta || data?.resposta || data?.mensagem
      setMensagens(m => [...m, { id: crypto.randomUUID(), remetente: 'chatbot', conteudo: resposta, criado_em: new Date().toISOString() }])
    } catch (e) {
      console.error('[Chatbot] API de IA falhou — usando resposta local. Causa:', e?.status, e?.data?.codigo || e?.message, e)
      const resposta = buscarResposta(pergunta)
      await new Promise(r => setTimeout(r, 600))
      setMensagens(m => [...m, { id: crypto.randomUUID(), remetente: 'chatbot', conteudo: resposta, criado_em: new Date().toISOString() }])
    } finally {
      setEnviando(false)
    }
  }

  const limparConversa = () => {
    setMensagens([SAUDACAO])
  }

  const renderTexto = (texto) =>
    texto.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')

  const totalMsgs = mensagens.length - 1

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setAberto(v => !v)}
        title="Abrir assistente"
        style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000,
          width: '56px', height: '56px', borderRadius: '50%',
          background: aberto
            ? 'rgba(255,255,255,0.08)'
            : 'linear-gradient(135deg, var(--neon-orange), #C2410C)',
          boxShadow: aberto
            ? '0 2px 12px rgba(0,0,0,0.3)'
            : '0 4px 20px rgba(232, 89, 12, 0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s ease',
          border: aberto ? '1px solid rgba(255,255,255,0.12)' : 'none',
          cursor: 'pointer',
        }}
        onMouseEnter={e => { if (!aberto) { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(232, 89, 12, 0.7)' } }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = aberto ? '0 2px 12px rgba(0,0,0,0.3)' : '0 4px 20px rgba(232, 89, 12, 0.5)' }}
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
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
            animation: 'overlayIn 0.15s ease',
          }}
        >
          <div style={{
            width: 'min(880px, 96vw)',
            height: 'min(700px, 88vh)',
            background: '#111114',
            border: '1px solid rgba(232, 89, 12, 0.18)',
            borderRadius: '16px',
            boxShadow: '0 32px 80px rgba(0,0,0,0.8), 0 0 60px rgba(232,89,12,0.07)',
            display: 'flex',
            overflow: 'hidden',
            animation: 'scaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
          }}>

            {/* ── Sidebar esquerda ── */}
            <div style={{
              width: '230px', flexShrink: 0,
              borderRight: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', flexDirection: 'column',
              background: 'rgba(255,255,255,0.01)',
            }}>
              {/* Gradiente top */}
              <div style={{ height: '2px', background: 'linear-gradient(90deg, var(--neon-orange), var(--electric-blue))' }} />

              {/* Info do bot */}
              <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{
                  width: '52px', height: '52px', borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(232,89,12,0.15), rgba(232,89,12,0.04))',
                  border: '1px solid rgba(232, 89, 12, 0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '12px',
                }}>
                  <Bot size={24} color="var(--neon-orange)" />
                </div>
                <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>Assistente SIGAuto</div>
                <div style={{ fontSize: '11px', color: 'var(--status-done)', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '5px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--status-done)', display: 'inline-block' }} />
                  Online
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
                        background: 'rgba(232, 89, 12, 0.04)',
                        border: '1px solid rgba(232, 89, 12, 0.12)',
                        borderRadius: '8px', fontSize: '12px',
                        color: 'var(--text-secondary)', cursor: 'pointer',
                        fontFamily: 'var(--font-body)', lineHeight: '1.4',
                        transition: 'all 0.12s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(232,89,12,0.1)'; e.currentTarget.style.color = 'var(--neon-orange)'; e.currentTarget.style.borderColor = 'rgba(232,89,12,0.3)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(232,89,12,0.04)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'rgba(232,89,12,0.12)' }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rodapé sidebar */}
              <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <button
                  onClick={limparConversa}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '7px 10px', background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '8px', fontSize: '12px',
                    color: 'var(--text-muted)', cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.3)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
                >
                  <Trash2 size={13} /> Limpar conversa
                </button>
              </div>
            </div>

            {/* ── Área de chat ── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

              {/* Header do chat */}
              <div style={{ height: '2px', background: 'linear-gradient(90deg, transparent, rgba(232,89,12,0.3))' }} />
              <div style={{
                padding: '14px 20px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
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
                  title="Fechar (Esc)"
                  style={{
                    color: 'var(--text-muted)', background: 'transparent', border: 'none',
                    cursor: 'pointer', padding: '6px', borderRadius: '8px',
                    display: 'flex', alignItems: 'center',
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Mensagens */}
              <div style={{
                flex: 1, overflowY: 'auto',
                padding: '20px 24px',
                display: 'flex', flexDirection: 'column', gap: '16px',
              }}>
                {mensagens.map(msg => (
                  <div key={msg.id} style={{ display: 'flex', gap: '10px', flexDirection: msg.remetente === 'usuario' ? 'row-reverse' : 'row' }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0, marginTop: '2px',
                      background: msg.remetente === 'usuario'
                        ? 'linear-gradient(135deg, var(--neon-orange), #C2410C)'
                        : 'rgba(232, 89, 12, 0.08)',
                      border: msg.remetente === 'chatbot' ? '1px solid rgba(232, 89, 12, 0.25)' : 'none',
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
                        ? 'linear-gradient(135deg, rgba(232, 89, 12, 0.18), rgba(255, 42, 0, 0.12))'
                        : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${msg.remetente === 'usuario' ? 'rgba(232, 89, 12, 0.2)' : 'rgba(255,255,255,0.06)'}`,
                      fontSize: '14px', lineHeight: '1.6', color: 'var(--text-primary)',
                    }}>
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
                      background: 'rgba(232, 89, 12, 0.08)', border: '1px solid rgba(232, 89, 12, 0.25)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Bot size={15} color="var(--neon-orange)" />
                    </div>
                    <div style={{
                      padding: '12px 16px',
                      background: 'rgba(255,255,255,0.04)',
                      borderRadius: '4px 14px 14px 14px',
                      border: '1px solid rgba(255,255,255,0.06)',
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
                borderTop: '1px solid rgba(255,255,255,0.05)',
                display: 'flex', gap: '10px', flexShrink: 0,
                background: 'rgba(255,255,255,0.01)',
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
                      ? 'linear-gradient(135deg, var(--neon-orange), #C2410C)'
                      : 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(232, 89, 12, 0.25)',
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

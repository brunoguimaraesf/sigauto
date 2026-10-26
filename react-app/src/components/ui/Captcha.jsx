import { useEffect, useRef } from 'react'
import { captchaHabilitado, chaveCaptcha } from '../../utils/captcha'

// CAPTCHA (Cloudflare Turnstile) do login e da recuperacao de senha (QA-11).
//
// O bloqueio de cinco falhas (RN29) vive no backend, mas a URL e a chave anon
// do Supabase Auth sao publicas: quem chama `grant_type=password` direto no
// provedor nao passa pelo Express. No plano Free nao ha hook de verificacao de
// senha; a protecao que vale tambem para chamada direta e o CAPTCHA do proprio
// Supabase Auth. Com ele ligado no painel, o provedor recusa qualquer login ou
// envio de recuperacao sem token resolvido.
//
// Sem VITE_TURNSTILE_SITE_KEY o componente nao renderiza e as telas seguem como
// antes: o codigo pode ser publicado ANTES de ligar o CAPTCHA no painel. Ligar
// no painel sem a chave publicada trava todos os logins.

const URL_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let carregamento = null
function carregarTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (!carregamento) {
    carregamento = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = URL_SCRIPT
      script.async = true
      script.onload = () => resolve(window.turnstile)
      script.onerror = () => { carregamento = null; reject(new Error('Falha ao carregar o CAPTCHA.')) }
      document.head.appendChild(script)
    })
  }
  return carregamento
}

// `renovar` muda a cada tentativa: o token do Turnstile e de uso unico.
export function Captcha({ onToken, renovar = 0 }) {
  const alvo = useRef(null)
  const widget = useRef(null)
  const callback = useRef(onToken)

  useEffect(() => {
    callback.current = onToken
  }, [onToken])

  useEffect(() => {
    if (!captchaHabilitado()) return undefined
    let ativo = true
    carregarTurnstile().then((turnstile) => {
      if (!ativo || !alvo.current || !turnstile) return
      widget.current = turnstile.render(alvo.current, {
        sitekey: chaveCaptcha(),
        language: 'pt-br',
        callback: (token) => callback.current(token),
        'expired-callback': () => callback.current(null),
        'error-callback': () => callback.current(null),
      })
    }).catch(() => callback.current(null))
    return () => {
      ativo = false
      if (widget.current !== null && window.turnstile) window.turnstile.remove(widget.current)
      widget.current = null
    }
  }, [])

  useEffect(() => {
    if (renovar && widget.current !== null && window.turnstile) {
      callback.current(null)
      window.turnstile.reset(widget.current)
    }
  }, [renovar])

  if (!captchaHabilitado()) return null
  return <div ref={alvo} data-testid="captcha" aria-label="Verificação de segurança" />
}

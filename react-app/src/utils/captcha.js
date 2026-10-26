// Chave PUBLICA do Cloudflare Turnstile (QA-11). Vazia = CAPTCHA desligado.
export const chaveCaptcha = () => import.meta.env.VITE_TURNSTILE_SITE_KEY || ''
export const captchaHabilitado = () => Boolean(chaveCaptcha())

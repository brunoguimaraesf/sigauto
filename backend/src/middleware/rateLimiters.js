import rateLimit from 'express-rate-limit'

function inteiroPositivo(valor, padrao) {
  const numero = Number.parseInt(valor, 10)
  return Number.isSafeInteger(numero) && numero > 0 ? numero : padrao
}

export function criarLimitadores(opcoes = {}) {
  const loginWindowMs = inteiroPositivo(opcoes.loginWindowMs ?? process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000)
  const loginMax = inteiroPositivo(opcoes.loginMax ?? process.env.LOGIN_RATE_LIMIT_MAX, 5)
  const apiWindowMs = inteiroPositivo(opcoes.apiWindowMs ?? process.env.API_RATE_LIMIT_WINDOW_MS, 60 * 1000)
  const apiMax = inteiroPositivo(opcoes.apiMax ?? process.env.API_RATE_LIMIT_MAX, 100)
  const iaWindowMs = inteiroPositivo(opcoes.iaWindowMs ?? process.env.IA_RATE_LIMIT_WINDOW_MS, 60 * 1000)
  const iaMax = inteiroPositivo(opcoes.iaMax ?? process.env.IA_RATE_LIMIT_MAX, 10)

  const loginRateLimiter = rateLimit({
    windowMs: loginWindowMs,
    max: loginMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      erro: true,
      codigo: 'MUITAS_TENTATIVAS',
      mensagem: 'Muitas tentativas de login. Tente novamente em 10 minutos.',
    },
  })

  const apiRateLimiter = rateLimit({
    windowMs: apiWindowMs,
    max: apiMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      erro: true,
      codigo: 'RATE_LIMIT',
      mensagem: 'Limite de requisições excedido. Tente novamente em alguns segundos.',
    },
  })

  const iaRateLimiter = rateLimit({
    windowMs: iaWindowMs,
    max: iaMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      erro: true,
      codigo: 'RATE_LIMIT_IA',
      mensagem: 'Muitas requisições à IA em pouco tempo. Aguarde um momento.',
    },
  })

  return { loginRateLimiter, apiRateLimiter, iaRateLimiter }
}

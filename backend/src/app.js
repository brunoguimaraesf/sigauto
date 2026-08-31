import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

import authRoutes from './routes/authRoutes.js'
import chatbotRoutes from './routes/chatbotRoutes.js'
import iaRoutes from './routes/iaRoutes.js'
import { errorHandler } from './middleware/errorHandler.js'

const app = express()

// Atrás do proxy da Vercel/Render — necessário para req.ip e o rate-limit
app.set('trust proxy', 1)

// Security headers
app.use(helmet())

// CORS — normaliza a origem (remove caminho/barra final) para casar com o
// header Origin do navegador, que é sempre só esquema + domínio.
let corsOrigin = process.env.FRONTEND_URL || 'http://localhost:5173'
try { corsOrigin = new URL(corsOrigin).origin } catch { /* mantém o valor original */ }

app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}))

// Body parser
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))

// Rate limiter específico para login
const loginRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    erro: true,
    codigo: 'MUITAS_TENTATIVAS',
    mensagem: 'Muitas tentativas de login. Tente novamente em 10 minutos.'
  },
  keyGenerator: (req) => req.ip
})

// Rate limiter geral para API
const apiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    erro: true,
    codigo: 'RATE_LIMIT',
    mensagem: 'Limite de requisições excedido. Tente novamente em alguns segundos.'
  }
})

// Rate limiter mais restrito para rotas de IA (cada chamada consome cota do Gemini).
// Observação: em serverless (Vercel), o store em memória não persiste entre
// invocações — a garantia real contra abuso é o teto de cota/orçamento na
// chave do Gemini (Google Cloud). Este limite é defesa em profundidade.
const iaRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    erro: true,
    codigo: 'RATE_LIMIT_IA',
    mensagem: 'Muitas requisições à IA em pouco tempo. Aguarde um momento.'
  }
})

app.use('/api/v1', apiRateLimiter)

// Rotas. O frontend fala DIRETO com o Supabase (chave anon + RLS) para todo o
// CRUD de dados; por isso o backend expõe apenas o que o cliente realmente usa:
// autenticação, chatbot e IA. As antigas rotas CRUD (clientes, veiculos, os,
// estoque, etc.) foram removidas: elas rodavam com service_role (ignorando o
// RLS) e, sem checagem de dono, eram uma superfície de IDOR/bypass do RLS.
app.use('/api/v1/auth', loginRateLimiter, authRoutes)
app.use('/api/v1/chatbot', iaRateLimiter, chatbotRoutes)
app.use('/api/v1/ia', iaRateLimiter, iaRoutes)

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    erro: true,
    codigo: 'ROTA_NAO_ENCONTRADA',
    mensagem: `Rota ${req.method} ${req.originalUrl} não encontrada.`
  })
})

// Global error handler (must be last)
app.use(errorHandler)

const PORT = process.env.PORT || 3001

// Na Vercel o app é importado como função serverless (sem servidor persistente).
// Localmente e em hosts tradicionais (Render), sobe o servidor normalmente.
if (!process.env.VERCEL && !process.env.VITEST) {
  app.listen(PORT, () => {
    console.log(`[SIGAuto] Servidor iniciado na porta ${PORT} (${process.env.NODE_ENV || 'development'})`)
    console.log(`[SIGAuto] API disponível em http://localhost:${PORT}/api/v1`)
  })
}

export default app

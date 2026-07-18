import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

import authRoutes from './routes/authRoutes.js'
import clienteRoutes from './routes/clienteRoutes.js'
import veiculoRoutes from './routes/veiculoRoutes.js'
import osRoutes from './routes/osRoutes.js'
import estoqueRoutes from './routes/estoqueRoutes.js'
import movimentacaoRoutes from './routes/movimentacaoRoutes.js'
import relatorioRoutes from './routes/relatorioRoutes.js'
import chatbotRoutes from './routes/chatbotRoutes.js'
import iaRoutes from './routes/iaRoutes.js'
import usuarioRoutes from './routes/usuarioRoutes.js'
import { errorHandler } from './middleware/errorHandler.js'

const app = express()

// Security headers
app.use(helmet())

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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

app.use('/api/v1', apiRateLimiter)

// Rotas
app.use('/api/v1/auth', loginRateLimiter, authRoutes)
app.use('/api/v1/clientes', clienteRoutes)
app.use('/api/v1/veiculos', veiculoRoutes)
app.use('/api/v1/os', osRoutes)
app.use('/api/v1/estoque', estoqueRoutes)
app.use('/api/v1/movimentacoes', movimentacaoRoutes)
app.use('/api/v1/relatorios', relatorioRoutes)
app.use('/api/v1/chatbot', chatbotRoutes)
app.use('/api/v1/ia', iaRoutes)
app.use('/api/v1/usuarios', usuarioRoutes)

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

app.listen(PORT, () => {
  console.log(`[SIGAuto] Servidor iniciado na porta ${PORT} (${process.env.NODE_ENV || 'development'})`)
  console.log(`[SIGAuto] API disponível em http://localhost:${PORT}/api/v1`)
})

export default app

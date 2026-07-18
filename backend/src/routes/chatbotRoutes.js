import { Router } from 'express'
import { mensagem, historico } from '../controllers/chatbotController.js'
import { authMiddleware } from '../middleware/authMiddleware.js'

const router = Router()

router.post('/mensagem', authMiddleware, mensagem)
router.get('/historico', authMiddleware, historico)

export default router

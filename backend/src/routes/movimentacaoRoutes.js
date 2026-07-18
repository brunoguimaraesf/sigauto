import { Router } from 'express'
import { historico } from '../controllers/movimentacaoController.js'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'

const router = Router()

router.get('/', authMiddleware, requireRole('gestor', 'atendente', 'mecanico'), historico)

export default router

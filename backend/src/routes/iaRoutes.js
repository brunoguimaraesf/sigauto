import { Router } from 'express'
import { analisar, listarRecomendacoes } from '../controllers/iaController.js'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'

const router = Router()

router.use(authMiddleware, requireRole('gestor'))

router.post('/analisar', analisar)
router.get('/recomendacoes', listarRecomendacoes)

export default router

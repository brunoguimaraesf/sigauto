import { Router } from 'express'
import { listar, detalhe, criar, atualizar, inativar } from '../controllers/clienteController.js'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'

const router = Router()

router.get('/', authMiddleware, requireRole('gestor', 'atendente'), listar)
router.get('/:id', authMiddleware, requireRole('gestor', 'atendente'), detalhe)
router.post('/', authMiddleware, requireRole('gestor', 'atendente'), criar)
router.put('/:id', authMiddleware, requireRole('gestor', 'atendente'), atualizar)
router.patch('/:id/inativar', authMiddleware, requireRole('gestor'), inativar)

export default router

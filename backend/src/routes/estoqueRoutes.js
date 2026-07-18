import { Router } from 'express'
import { listar, detalhe, criar, atualizar, inativar, entrada, saida } from '../controllers/estoqueController.js'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'

const router = Router()

router.get('/', authMiddleware, requireRole('gestor', 'atendente', 'mecanico'), listar)
router.get('/:id', authMiddleware, requireRole('gestor', 'atendente', 'mecanico'), detalhe)
router.post('/', authMiddleware, requireRole('gestor', 'atendente'), criar)
router.put('/:id', authMiddleware, requireRole('gestor', 'atendente'), atualizar)
router.patch('/:id/inativar', authMiddleware, requireRole('gestor'), inativar)
router.post('/:id/entrada', authMiddleware, requireRole('gestor', 'atendente'), entrada)
router.post('/:id/saida', authMiddleware, requireRole('gestor', 'atendente', 'mecanico'), saida)

export default router

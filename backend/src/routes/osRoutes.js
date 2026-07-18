import { Router } from 'express'
import { listar, detalhe, abrir, atualizar, encerrar, cancelar } from '../controllers/osController.js'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'

const router = Router()

router.get('/', authMiddleware, requireRole('gestor', 'atendente', 'mecanico'), listar)
router.get('/:id', authMiddleware, requireRole('gestor', 'atendente', 'mecanico'), detalhe)
router.post('/', authMiddleware, requireRole('gestor', 'atendente'), abrir)
router.put('/:id', authMiddleware, requireRole('gestor', 'atendente', 'mecanico'), atualizar)
router.patch('/:id/encerrar', authMiddleware, requireRole('gestor', 'atendente'), encerrar)
router.patch('/:id/cancelar', authMiddleware, requireRole('gestor', 'atendente'), cancelar)

export default router

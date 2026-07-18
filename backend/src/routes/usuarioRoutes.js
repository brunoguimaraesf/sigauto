import { Router } from 'express'
import { listar, criar, atualizar, inativar } from '../controllers/usuarioController.js'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'

const router = Router()

router.use(authMiddleware, requireRole('gestor'))

router.get('/', listar)
router.post('/', criar)
router.put('/:id', atualizar)
router.patch('/:id/inativar', inativar)

export default router

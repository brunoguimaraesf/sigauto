import { Router } from 'express'
import { login, logout, refresh, forgotPassword, criarUsuario, atualizarUsuario } from '../controllers/authController.js'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'

const router = Router()

router.post('/login', login)
router.post('/logout', logout)
router.post('/refresh', refresh)
router.post('/forgot-password', forgotPassword)
router.post('/usuarios', authMiddleware, requireRole('gestor'), criarUsuario)
router.patch('/usuarios/:id', authMiddleware, requireRole('gestor'), atualizarUsuario)

export default router

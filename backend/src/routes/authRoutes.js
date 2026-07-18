import { Router } from 'express'
import { login, logout, refresh, forgotPassword } from '../controllers/authController.js'

const router = Router()

router.post('/login', login)
router.post('/logout', logout)
router.post('/refresh', refresh)
router.post('/forgot-password', forgotPassword)

export default router

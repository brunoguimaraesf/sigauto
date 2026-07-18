import { Router } from 'express'
import {
  atendimentos,
  faturamento,
  estoqueAtual,
  servicosFrequentes,
  clientesFrequentes
} from '../controllers/relatorioController.js'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'

const router = Router()

router.use(authMiddleware, requireRole('gestor'))

router.get('/atendimentos', atendimentos)
router.get('/faturamento', faturamento)
router.get('/estoque-atual', estoqueAtual)
router.get('/servicos-frequentes', servicosFrequentes)
router.get('/clientes-frequentes', clientesFrequentes)

export default router

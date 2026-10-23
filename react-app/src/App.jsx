import { lazy, Suspense, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './context/AuthContext'
import { ProtectedRoute } from './components/ui/ProtectedRoute'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import { Chatbot } from './components/ui/Chatbot'
import { DataProvider } from './hooks/useDatabase'
import css from './App.module.css'

// Cada tela vira um chunk independente. O shell (auth, menu e dados) continua
// imediato; bibliotecas pesadas de relatorio/PDF so baixam quando necessarias.
const pagina = (importar, nome) => lazy(() => importar().then(modulo => ({ default: modulo[nome] })))
const Login = pagina(() => import('./pages/Login'), 'Login')
const ResetPassword = pagina(() => import('./pages/ResetPassword'), 'ResetPassword')
const Dashboard = pagina(() => import('./pages/Dashboard'), 'Dashboard')
const Veiculos = pagina(() => import('./pages/Veiculos'), 'Veiculos')
const Clientes = pagina(() => import('./pages/Clientes'), 'Clientes')
const Servicos = pagina(() => import('./pages/Servicos'), 'Servicos')
const Analytics = pagina(() => import('./pages/Analytics'), 'Analytics')
const Historico = pagina(() => import('./pages/Historico'), 'Historico')
const Relatorios = pagina(() => import('./pages/Relatorios'), 'Relatorios')
const PainelIA = pagina(() => import('./pages/PainelIA'), 'PainelIA')
const Usuarios = pagina(() => import('./pages/Usuarios'), 'Usuarios')
const Funcionarios = pagina(() => import('./pages/Funcionarios'), 'Funcionarios')
const ConfiguracaoOficina = pagina(() => import('./pages/ConfiguracaoOficina'), 'ConfiguracaoOficina')
const ListaOS = pagina(() => import('./pages/OrdemServico/ListaOS'), 'ListaOS')
const AbrirOS = pagina(() => import('./pages/OrdemServico/AbrirOS'), 'AbrirOS')
const AtualizarOS = pagina(() => import('./pages/OrdemServico/AtualizarOS'), 'AtualizarOS')
const EncerrarOS = pagina(() => import('./pages/OrdemServico/EncerrarOS'), 'EncerrarOS')
const ListaEstoque = pagina(() => import('./pages/Estoque/ListaEstoque'), 'ListaEstoque')

function CarregandoTela() {
  return <div className={css.carregando} role="status">Carregando tela...</div>
}

function PaginaInicial() {
  const { perfil } = useAuth()
  if (perfil === 'mecanico') return <Navigate to="/ordens-servico" replace />
  return <ProtectedRoute requiredRoles={['gestor', 'atendente']}><Dashboard /></ProtectedRoute>
}

function RedirecionamentoPadrao() {
  const { perfil } = useAuth()
  return <Navigate to={perfil === 'mecanico' ? '/ordens-servico' : '/'} replace />
}

function AppLayout() {
  const { user, perfil } = useAuth()
  // A gaveta de navegacao do mobile. O estado vive aqui porque o botao que abre
  // esta no Header e a gaveta e a Sidebar, irmaos no layout.
  const [menuAberto, setMenuAberto] = useState(false)

  return (
    <DataProvider>
    <div className="app-container">
      <Sidebar aberta={menuAberto} onFechar={() => setMenuAberto(false)} />
      {menuAberto && (
        <div
          className="sidebar-overlay"
          onClick={() => setMenuAberto(false)}
          aria-hidden="true"
        />
      )}
      <main className="main-content">
        <Header onAbrirMenu={() => setMenuAberto(true)} />
        <Suspense fallback={<CarregandoTela />}>
        <Routes>
          {/* Dashboard */}
          <Route path="/" element={
            <PaginaInicial />
          } />

          {/* Ordens de Serviço */}
          <Route path="/ordens-servico" element={<ProtectedRoute><ListaOS /></ProtectedRoute>} />
          <Route path="/ordens-servico/nova" element={<ProtectedRoute requiredRoles={['gestor', 'atendente']}><AbrirOS /></ProtectedRoute>} />
          <Route path="/ordens-servico/:id" element={<ProtectedRoute><AtualizarOS /></ProtectedRoute>} />
          <Route path="/ordens-servico/:id/encerrar" element={<ProtectedRoute requiredRoles={['gestor', 'atendente']}><EncerrarOS /></ProtectedRoute>} />

          {/* Histórico */}
          <Route path="/historico" element={<ProtectedRoute><Historico /></ProtectedRoute>} />

          {/* Clientes */}
          <Route path="/clientes" element={<ProtectedRoute requiredRoles={['gestor', 'atendente']}><Clientes /></ProtectedRoute>} />

          {/* Veículos */}
          <Route path="/veiculos" element={<ProtectedRoute requiredRoles={['gestor', 'atendente']}><Veiculos /></ProtectedRoute>} />

          {/* Serviços */}
          <Route path="/servicos" element={<ProtectedRoute requiredRoles={['gestor', 'atendente']}><Servicos /></ProtectedRoute>} />

          {/* Estoque */}
          <Route path="/estoque" element={<ProtectedRoute requiredRoles={['gestor', 'atendente']}><ListaEstoque /></ProtectedRoute>} />

          {/* Relatórios - gestor apenas */}
          <Route path="/relatorios" element={<ProtectedRoute requiredRoles={['gestor']}><Relatorios /></ProtectedRoute>} />

          {/* Analytics (legado) */}
          <Route path="/analytics" element={<ProtectedRoute requiredRoles={['gestor']}><Analytics /></ProtectedRoute>} />

          {/* Painel IA - gestor apenas */}
          <Route path="/painel-ia" element={<ProtectedRoute requiredRoles={['gestor']}><PainelIA /></ProtectedRoute>} />

          {/* Funcionários - gestor apenas */}
          <Route path="/funcionarios" element={<ProtectedRoute requiredRoles={['gestor']}><Funcionarios /></ProtectedRoute>} />

          {/* Usuários - gestor apenas */}
          <Route path="/usuarios" element={<ProtectedRoute requiredRoles={['gestor']}><Usuarios /></ProtectedRoute>} />

          {/* Configuração da oficina (cabeçalho da O.S.) - gestor apenas */}
          <Route path="/configuracao-oficina" element={<ProtectedRoute requiredRoles={['gestor']}><ConfiguracaoOficina /></ProtectedRoute>} />

          {/* Redirect raiz para dashboard se logado */}
          <Route path="*" element={<RedirecionamentoPadrao />} />
        </Routes>
        </Suspense>
      </main>
      <Chatbot key={`${user?.id}:${perfil}`} />
    </div>
    </DataProvider>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
          <Routes>
            <Route path="/login" element={<Suspense fallback={<CarregandoTela />}><Login /></Suspense>} />
            <Route path="/reset-password" element={<Suspense fallback={<CarregandoTela />}><ResetPassword /></Suspense>} />
            <Route path="/*" element={<AppLayout />} />
          </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App

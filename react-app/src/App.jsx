import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ui/ProtectedRoute'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import { Chatbot } from './components/ui/Chatbot'

// Pages
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Veiculos } from './pages/Veiculos'
import { Clientes } from './pages/Clientes'
import { Servicos } from './pages/Servicos'
import { Analytics } from './pages/Analytics'
import { Historico } from './pages/Historico'
import { Relatorios } from './pages/Relatorios'
import { PainelIA } from './pages/PainelIA'
import { Usuarios } from './pages/Usuarios'

// OS Pages
import { ListaOS } from './pages/OrdemServico/ListaOS'
import { AbrirOS } from './pages/OrdemServico/AbrirOS'
import { AtualizarOS } from './pages/OrdemServico/AtualizarOS'
import { EncerrarOS } from './pages/OrdemServico/EncerrarOS'

// Estoque Pages
import { ListaEstoque } from './pages/Estoque/ListaEstoque'

function AppLayout() {
  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        <Header />
        <Routes>
          {/* Dashboard */}
          <Route path="/" element={
            <ProtectedRoute requiredRoles={['gestor', 'atendente']}>
              <Dashboard />
            </ProtectedRoute>
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

          {/* Usuários - gestor apenas */}
          <Route path="/usuarios" element={<ProtectedRoute requiredRoles={['gestor']}><Usuarios /></ProtectedRoute>} />

          {/* Redirect raiz para dashboard se logado */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Chatbot />
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<AppLayout />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App

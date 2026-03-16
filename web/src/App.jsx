import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import Login from './pages/Login'

export default function App() {
  return (
    <BrowserRouter basename="/my">
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<div>Other</div>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { EditProfilePage } from '@/pages/EditProfilePage'
import { SessionsPage } from '@/pages/SessionsPage'
import { MessengerLayout } from '@/pages/MessengerLayout'
import { ChatListPage } from '@/pages/ChatListPage'
import { ChatPage } from '@/pages/ChatPage'
import { AdminLayout } from '@/pages/admin/AdminLayout'
import { AdminUsersPage } from '@/pages/admin/AdminUsersPage'
import { AdminUserMessagesPage } from '@/pages/admin/AdminUserMessagesPage'
import { AdminContainersPage } from '@/pages/admin/AdminContainersPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'ADMIN') return <Navigate to="/" replace />
  return <>{children}</>
}

function RequireGuest({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Messenger (sidebar + chat) */}
        <Route element={<RequireAuth><MessengerLayout /></RequireAuth>}>
          <Route path="/" element={<ChatListPage />} />
          <Route path="/chat/:id" element={<ChatPage />} />
        </Route>

        {/* Profile */}
        <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="/profile/edit" element={<RequireAuth><EditProfilePage /></RequireAuth>} />
        <Route path="/sessions" element={<RequireAuth><SessionsPage /></RequireAuth>} />

        {/* Auth */}
        <Route path="/login" element={<RequireGuest><LoginPage /></RequireGuest>} />
        <Route path="/register" element={<RequireGuest><RegisterPage /></RequireGuest>} />

        {/* Admin */}
        <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
          <Route index element={<Navigate to="/admin/users" replace />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="users/:id/messages" element={<AdminUserMessagesPage />} />
          <Route path="containers" element={<AdminContainersPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { EditProfilePage } from '@/pages/EditProfilePage'
import { SettingsPage } from '@/pages/SettingsPage'
import { SessionsPage } from '@/pages/SessionsPage'
import { MessengerLayout } from '@/pages/MessengerLayout'
import { ChatListPage } from '@/pages/ChatListPage'
import { ChatPage } from '@/pages/ChatPage'
import { ContactsPage } from '@/pages/ContactsPage'
import { UserProfilePage } from '@/pages/UserProfilePage'
import { AdminLayout } from '@/pages/admin/AdminLayout'
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage'
import { AdminUsersPage } from '@/pages/admin/AdminUsersPage'
import { AdminUserProfilePage } from '@/pages/admin/AdminUserProfilePage'
import { AdminAnalyticsPage } from '@/pages/admin/AdminAnalyticsPage'
import { AdminModerationPage } from '@/pages/admin/AdminModerationPage'
import { AdminBadgesPage } from '@/pages/admin/AdminBadgesPage'
import { AdminAiCenterPage } from '@/pages/admin/AdminAiCenterPage'
import { AdminMailCenterPage } from '@/pages/admin/AdminMailCenterPage'
import { AdminPaymentsPage } from '@/pages/admin/AdminPaymentsPage'
import { AdminContainersPage } from '@/pages/admin/AdminContainersPage'
import { AdminBackupsPage } from '@/pages/admin/AdminBackupsPage'
import { CallOverlay } from '@/components/call/CallOverlay'
import { IncomingCallBanner } from '@/components/call/IncomingCallBanner'
import { useCallSignaling } from '@/hooks/useCallSignaling'

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

// Глобальный слой звонков: слушает сигналинг и рендерит экран звонка
// поверх всего приложения. Внутри BrowserRouter — использует useNavigate.
function CallLayer() {
  useCallSignaling()
  return (
    <>
      <IncomingCallBanner />
      <CallOverlay />
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <CallLayer />
      <Routes>
        {/* Messenger (sidebar + chat) */}
        <Route element={<RequireAuth><MessengerLayout /></RequireAuth>}>
          <Route path="/" element={<ChatListPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/chat/:id" element={<ChatPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        {/* Profile */}
        <Route path="/profile/edit" element={<RequireAuth><EditProfilePage /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
        <Route path="/sessions" element={<RequireAuth><SessionsPage /></RequireAuth>} />
        <Route path="/u/:username" element={<RequireAuth><UserProfilePage /></RequireAuth>} />

        {/* Auth */}
        <Route path="/login" element={<RequireGuest><LoginPage /></RequireGuest>} />
        <Route path="/register" element={<RequireGuest><RegisterPage /></RequireGuest>} />
        <Route path="/forgot-password" element={<RequireGuest><ForgotPasswordPage /></RequireGuest>} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Admin */}
        <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="users/:id" element={<AdminUserProfilePage />} />
          <Route path="moderation" element={<AdminModerationPage />} />
          <Route path="badges" element={<AdminBadgesPage />} />
          <Route path="analytics" element={<AdminAnalyticsPage />} />
          <Route path="ai" element={<AdminAiCenterPage />} />
          <Route path="mail" element={<AdminMailCenterPage />} />
          <Route path="payments" element={<AdminPaymentsPage />} />
          <Route path="containers" element={<AdminContainersPage />} />
          <Route path="backups" element={<AdminBackupsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

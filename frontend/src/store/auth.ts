import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/api/auth'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  setAuth: (user: User, accessToken: string, refreshToken: string) => void
  setTokens: (accessToken: string, refreshToken: string) => void
  setUser: (user: User) => void
  logout: () => void
}

// Гарантирует наличие массивов interests/badges даже для «старых» объектов
// пользователя (например, сохранённых в localStorage до их появления),
// иначе .map/.length падают и экран профиля становится пустым.
function normalizeUser<T extends User | null>(user: T): T {
  if (!user) return user
  return {
    ...user,
    interests: Array.isArray(user.interests) ? user.interests : [],
    badges: Array.isArray(user.badges) ? user.badges : [],
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,

      setAuth: (user, accessToken, refreshToken) =>
        set({ user: normalizeUser(user), accessToken, refreshToken }),

      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),

      setUser: (user) => set({ user: normalizeUser(user) }),

      logout: () => set({ user: null, accessToken: null, refreshToken: null }),
    }),
    {
      name: 'infy-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
      // При восстановлении из localStorage нормализуем пользователя,
      // чтобы старые сохранённые данные без interests/badges не ломали UI.
      merge: (persisted, current) => {
        const p = persisted as Partial<AuthState> | undefined
        return { ...current, ...p, user: normalizeUser(p?.user ?? null) }
      },
    },
  ),
)

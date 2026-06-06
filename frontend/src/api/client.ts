import axios from 'axios'
import { useAuthStore } from '@/store/auth'

const API_URL = import.meta.env.VITE_API_URL ?? '/api'

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach access token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Refresh token on 401
let isRefreshing = false
let queue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = []

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }

    original._retry = true

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        queue.push({ resolve, reject })
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`
        return api(original)
      })
    }

    isRefreshing = true

    try {
      const refreshToken = useAuthStore.getState().refreshToken
      if (!refreshToken) {
        useAuthStore.getState().logout()
        return new Promise(() => {})
      }

      const res = await axios.post(`${API_URL}/auth/refresh`, { refreshToken })
      const { accessToken: newAccess, refreshToken: newRefresh } = res.data.data

      useAuthStore.getState().setTokens(newAccess, newRefresh)

      queue.forEach(({ resolve }) => resolve(newAccess))
      queue = []

      original.headers.Authorization = `Bearer ${newAccess}`
      return api(original)
    } catch (err) {
      queue.forEach(({ reject }) => reject(err))
      queue = []
      useAuthStore.getState().logout()
      return new Promise(() => {})
    } finally {
      isRefreshing = false
    }
  },
)

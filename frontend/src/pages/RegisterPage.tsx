import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

export function RegisterPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  const [form, setForm] = useState({
    username: '',
    nickname: '',
    password: '',
    passwordConfirm: '',
    email: '',
    birthdate: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({
        ...prev,
        [field]: field === 'username' ? e.target.value.toLowerCase() : e.target.value,
      }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.password !== form.passwordConfirm) {
      setError(new Error('Passwords do not match'))
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await authApi.register({
        username: form.username,
        nickname: form.nickname,
        password: form.password,
        email: form.email || undefined,
        birthdate: form.birthdate || undefined,
      })
      const { user, accessToken, refreshToken } = res.data.data
      setAuth(user, accessToken, refreshToken)
      navigate('/')
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.svg" alt="Infy" className="mx-auto mb-3" width={56} height={56} />
          <h1 className="text-2xl font-bold">Create account</h1>
          <p className="text-gray-500 mt-1 text-sm">Join Infy Messenger</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error !== null && <ErrorMessage error={error} />}

            <div>
              <label className="label">Username</label>
              <input
                className="input"
                type="text"
                placeholder="lowercase_only"
                autoComplete="username"
                value={form.username}
                onChange={set('username')}
                pattern="[a-z0-9_]+"
                minLength={3}
                maxLength={32}
                required
              />
              <p className="text-xs text-gray-400 mt-1">3–32 chars, lowercase letters, numbers, _</p>
            </div>

            <div>
              <label className="label">Display name</label>
              <input
                className="input"
                type="text"
                placeholder="Your Name"
                value={form.nickname}
                onChange={set('nickname')}
                maxLength={64}
                required
              />
            </div>

            <div>
              <label className="label">Email <span className="text-gray-400">(optional)</span></label>
              <input
                className="input"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={form.email}
                onChange={set('email')}
              />
            </div>

            <div>
              <label className="label">Date of birth <span className="text-gray-400">(optional)</span></label>
              <input
                className="input"
                type="date"
                value={form.birthdate}
                onChange={set('birthdate')}
              />
            </div>

            <div>
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                placeholder="Min 8 characters"
                autoComplete="new-password"
                value={form.password}
                onChange={set('password')}
                minLength={8}
                required
              />
            </div>

            <div>
              <label className="label">Confirm password</label>
              <input
                className="input"
                type="password"
                placeholder="Repeat password"
                autoComplete="new-password"
                value={form.passwordConfirm}
                onChange={set('passwordConfirm')}
                required
              />
            </div>

            <button type="submit" className="btn-primary w-full mt-2" disabled={loading}>
              {loading ? <Spinner size={18} /> : 'Create account'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-primary-600 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

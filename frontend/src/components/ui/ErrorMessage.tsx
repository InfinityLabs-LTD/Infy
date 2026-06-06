import { AxiosError } from 'axios'

interface ErrorMessageProps {
  error: unknown
}

function extractMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const msg = error.response?.data?.error?.message
    if (typeof msg === 'string') return msg
  }
  if (error instanceof Error) return error.message
  return 'Что-то пошло не так'
}

export function ErrorMessage({ error }: ErrorMessageProps) {
  return (
    <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
      {extractMessage(error)}
    </div>
  )
}

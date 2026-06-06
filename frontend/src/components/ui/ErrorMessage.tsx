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
    <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {extractMessage(error)}
    </div>
  )
}

import { translateError } from '@/lib/errorMessages'

interface ErrorMessageProps {
  error: unknown
}

export function ErrorMessage({ error }: ErrorMessageProps) {
  return (
    <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
      {translateError(error)}
    </div>
  )
}

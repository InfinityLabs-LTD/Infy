interface Props {
  /** Сумма непрочитанных по всем диалогам. */
  unread: number
  onClick: () => void
}

/**
 * Лента Infy Pulse поверх списка чатов: появляется только когда есть
 * непрочитанные, ведёт в умный поиск/сводку. Делает AI видимой частью
 * главного экрана, а не скрытой функцией.
 */
export function AiPulseStrip({ unread, onClick }: Props) {
  if (unread <= 0) return null
  return (
    <button
      onClick={onClick}
      className="relative overflow-hidden mx-2 mt-2 mb-1 w-[calc(100%-1rem)] flex items-center gap-3 px-3.5 py-3 rounded-2xl transition-transform active:scale-[.99]"
      style={{
        background: 'var(--glass-1)',
        border: '1px solid var(--brand-ring)',
        boxShadow: 'var(--glow-ai)',
      }}
    >
      {/* Мягкое «дышащее» свечение слева */}
      <span
        className="ai-shimmer absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(140px 70px at 12% 50%, rgba(168,85,247,.18), transparent)' }}
      />
      <span
        className="relative shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white text-lg font-bold"
        style={{ background: 'var(--grad-own)', boxShadow: 'var(--glow-primary)' }}
      >
        ∞
      </span>
      <span className="relative flex-1 min-w-0 text-left">
        <span className="block text-[13px] font-semibold" style={{ color: 'var(--text-hi)' }}>
          {unread} {plural(unread)}
        </span>
        <span className="block text-[12px] truncate" style={{ color: 'var(--preview-read)' }}>
          Сводка от Infy Pulse · спросить по смыслу
        </span>
      </span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"
        className="relative shrink-0">
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  )
}

function plural(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'непрочитанное'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'непрочитанных'
  return 'непрочитанных'
}

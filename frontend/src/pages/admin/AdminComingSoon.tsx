import { motion } from 'framer-motion'

interface Feature {
  title: string
  desc: string
  icon: React.ReactNode
}

interface Props {
  title: string
  subtitle: string
  badge: string
  heroIcon: React.ReactNode
  features: Feature[]
  /** Превью-метрики, которые появятся, когда подсистема будет подключена */
  preview?: { label: string; placeholder: string }[]
}

// Спроектированная витрина раздела, у которого ещё нет бэкенд-подсистемы.
// Честно показывает «не подключено», но демонстрирует задуманную структуру.
export function AdminComingSoon({ title, subtitle, badge, heroIcon, features, preview }: Props) {
  return (
    <div className="p-4 md:p-6">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="glass rounded-2xl p-6 mb-3 relative overflow-hidden"
      >
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(600px 300px at 100% 0%, rgba(124,58,237,0.18), transparent 70%)' }} />
        <div className="relative flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--grad-own)', boxShadow: 'var(--glow-primary)' }}>
            {heroIcon}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-2xl font-bold text-white">{title}</h1>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(168,85,247,0.18)', color: '#C084FC', border: '1px solid rgba(168,85,247,0.35)' }}>
                {badge}
              </span>
            </div>
            <p className="text-sm mt-1 max-w-xl" style={{ color: 'var(--text-mid)' }}>{subtitle}</p>
          </div>
        </div>
      </motion.div>

      {/* Превью-метрики (placeholder) */}
      {preview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          {preview.map((p, i) => (
            <motion.div key={p.label}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32, delay: 0.05 + i * 0.04 }}
              className="glass rounded-2xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-low)' }}>
                {p.label}
              </p>
              <p className="font-display text-[22px] font-bold leading-none" style={{ color: 'rgba(255,255,255,0.25)' }}>
                {p.placeholder}
              </p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Задуманные возможности */}
      <div className="grid md:grid-cols-3 gap-3">
        {features.map((f, i) => (
          <motion.div key={f.title}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32, delay: 0.1 + i * 0.05 }}
            className="glass rounded-2xl p-4">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
              style={{ background: 'rgba(124,58,237,0.15)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round">{f.icon}</svg>
            </div>
            <p className="text-sm font-semibold text-white mb-1">{f.title}</p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-low)' }}>{f.desc}</p>
          </motion.div>
        ))}
      </div>

      <p className="text-xs mt-4 text-center" style={{ color: 'rgba(255,255,255,0.25)' }}>
        Раздел спроектирован — подсистема ещё не подключена к бэкенду
      </p>
    </div>
  )
}

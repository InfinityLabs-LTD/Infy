import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { adminApi, AdminAnalytics } from '@/api/admin'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

export function AdminAnalyticsPage() {
  const [data, setData] = useState<AdminAnalytics | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    adminApi.getAnalytics()
      .then(r => setData(r.data.data))
      .catch(e => setError(e))
  }, [])

  return (
    <div className="p-4 md:p-6">
      <div className="mb-5">
        <h1 className="font-display text-xl font-bold text-white">Аналитика</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-low)' }}>
          Активность, рост и удержание за 30 дней
        </p>
      </div>

      {error !== null && <div className="mb-4"><ErrorMessage error={error} /></div>}

      {!data && error === null ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="glass rounded-2xl h-[88px] animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
            ))}
          </div>
          <div className="glass rounded-2xl h-[220px] animate-pulse" />
        </div>
      ) : data && (
        <div className="space-y-3">
          {/* KPI */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi index={0} label="DAU сегодня" value={data.dauToday} hint="активны за сутки" />
            <Kpi index={1} label="MAU (30 дней)" value={data.mau30} hint="уникальных за месяц" />
            <Kpi index={2} label="Stickiness" value={data.mau30 > 0 ? Math.round((data.dauToday / data.mau30) * 100) : 0}
              suffix="%" hint="DAU / MAU" />
            <Kpi index={3} label="Регистраций (30д)"
              value={data.byDay.reduce((s, d) => s + d.registrations, 0)} hint="новых аккаунтов" />
          </div>

          {/* Area-чарт DAU */}
          <AreaChart
            title="Активные пользователи в день (DAU)"
            subtitle="по числу уникальных отправителей сообщений"
            data={data.byDay.map(d => ({ label: d.date, value: d.dau }))}
          />

          {/* Бары регистраций */}
          <BarChart
            title="Регистрации"
            data={data.byDay.map(d => ({ label: d.date, value: d.registrations }))}
          />

          {/* Retention-когорты */}
          <RetentionHeatmap cohorts={data.cohorts} />
        </div>
      )}
    </div>
  )
}

// ── KPI ──────────────────────────────────────────────────────

function Kpi({ label, value, suffix, hint, index }: {
  label: string; value: number; suffix?: string; hint: string; index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32, delay: index * 0.04 }}
      whileHover={{ y: -2 }}
      className="glass rounded-2xl p-4"
    >
      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-low)' }}>
        {label}
      </p>
      <p className="font-display text-[28px] font-bold leading-none text-white">
        {value.toLocaleString('ru-RU')}
        {suffix && <span className="text-base font-normal ml-0.5" style={{ color: 'var(--text-mid)' }}>{suffix}</span>}
      </p>
      <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-low)' }}>{hint}</p>
    </motion.div>
  )
}

// ── Area-чарт (SVG) ──────────────────────────────────────────

function AreaChart({ title, subtitle, data }: {
  title: string; subtitle?: string; data: Array<{ label: string; value: number }>
}) {
  const W = 800, H = 180, PAD = 8
  const max = Math.max(...data.map(d => d.value), 1)
  const n = data.length
  const x = (i: number) => PAD + (i / Math.max(n - 1, 1)) * (W - PAD * 2)
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2)

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${x(n - 1).toFixed(1)} ${H - PAD} L ${x(0).toFixed(1)} ${H - PAD} Z`
  const peakValue = Math.max(...data.map(d => d.value))

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32, delay: 0.1 }}
      className="glass rounded-2xl p-4"
    >
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-low)' }}>{title}</p>
        <p className="text-xs" style={{ color: 'var(--text-low)' }}>пик: <span className="text-white font-semibold">{peakValue}</span></p>
      </div>
      {subtitle && <p className="text-[11px] mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>{subtitle}</p>}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 180 }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="dau-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(124,58,237,0.35)" />
            <stop offset="100%" stopColor="rgba(124,58,237,0)" />
          </linearGradient>
        </defs>
        <motion.path
          d={areaPath}
          fill="url(#dau-fill)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        />
        <motion.path
          d={linePath}
          fill="none"
          stroke="#A855F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ type: 'spring', stiffness: 60, damping: 18, delay: 0.2 }}
        />
      </svg>
      <div className="flex justify-between mt-1 text-[10px]" style={{ color: 'var(--text-low)' }}>
        <span>{fmtDate(data[0]?.label)}</span>
        <span>{fmtDate(data[Math.floor(n / 2)]?.label)}</span>
        <span>{fmtDate(data[n - 1]?.label)}</span>
      </div>
    </motion.div>
  )
}

// ── Бар-чарт ─────────────────────────────────────────────────

function BarChart({ title, data }: { title: string; data: Array<{ label: string; value: number }> }) {
  const max = Math.max(...data.map(d => d.value), 1)
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32, delay: 0.14 }}
      className="glass rounded-2xl p-4"
    >
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-low)' }}>{title}</p>
        <p className="font-display text-lg font-bold text-white">{total.toLocaleString('ru-RU')}</p>
      </div>
      <div className="flex items-end gap-[3px] h-20">
        {data.map((d, i) => (
          <div key={d.label} className="flex-1 flex items-end min-w-0" title={`${fmtDate(d.label)}: ${d.value}`}>
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${Math.max((d.value / max) * 100, 2)}%` }}
              transition={{ type: 'spring', stiffness: 260, damping: 28, delay: 0.2 + i * 0.012 }}
              className="w-full rounded-t-sm"
              style={{ background: 'rgba(168,85,247,0.5)', minHeight: 2 }}
            />
          </div>
        ))}
      </div>
    </motion.div>
  )
}

// ── Retention-heatmap ────────────────────────────────────────

function RetentionHeatmap({ cohorts }: { cohorts: AdminAnalytics['cohorts'] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32, delay: 0.18 }}
      className="glass rounded-2xl p-4 overflow-x-auto"
    >
      <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-low)' }}>
        Удержание по когортам
      </p>
      <p className="text-[11px] mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>
        % когорты, отправивших сообщение в неделю N после регистрации
      </p>

      {cohorts.length === 0 ? (
        <p className="text-sm py-4" style={{ color: 'var(--text-low)' }}>Недостаточно данных для когортного анализа</p>
      ) : (
        <table className="border-separate" style={{ borderSpacing: 3 }}>
          <thead>
            <tr>
              <th className="text-left text-[10px] font-medium uppercase tracking-wider pr-3 pb-1"
                style={{ color: 'var(--text-low)' }}>Когорта</th>
              <th className="text-[10px] font-medium pr-2 pb-1" style={{ color: 'var(--text-low)' }}>Размер</th>
              {[0, 1, 2, 3, 4, 5].map(w => (
                <th key={w} className="text-[10px] font-medium w-12 pb-1" style={{ color: 'var(--text-low)' }}>
                  Н{w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c, ci) => (
              <tr key={c.week}>
                <td className="text-xs pr-3 whitespace-nowrap" style={{ color: 'var(--text-mid)' }}>
                  {fmtDate(c.week)}
                </td>
                <td className="text-xs text-center pr-2" style={{ color: 'var(--text-low)' }}>{c.size}</td>
                {c.retention.map((rate, wi) => (
                  <motion.td
                    key={wi}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 + ci * 0.05 + wi * 0.02 }}
                    className="w-12 h-9 rounded-lg text-center align-middle text-[11px] font-semibold"
                    style={{
                      background: heatColor(rate),
                      color: rate > 45 ? '#fff' : rate > 0 ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.25)',
                    }}
                  >
                    {wi === 0 ? '100%' : rate > 0 ? `${rate}%` : '·'}
                  </motion.td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </motion.div>
  )
}

// Фиолетовая тепловая шкала: 0% → прозрачное стекло, 100% → насыщенный бренд
function heatColor(rate: number): string {
  if (rate <= 0) return 'rgba(255,255,255,0.03)'
  const alpha = 0.12 + (rate / 100) * 0.78
  return `rgba(124,58,237,${alpha.toFixed(2)})`
}

function fmtDate(iso?: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

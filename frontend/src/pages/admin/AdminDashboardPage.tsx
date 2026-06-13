import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { adminApi, AdminStats, Container } from '@/api/admin'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

export function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [containers, setContainers] = useState<Container[] | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    adminApi.getStats()
      .then(r => setStats(r.data.data))
      .catch(e => setError(e))
    adminApi.listContainers()
      .then(r => setContainers(r.data.data))
      .catch(() => setContainers([]))   // контейнеры — некритичный блок
  }, [])

  return (
    <div className="p-4 md:p-6">
      <div className="mb-5">
        <h1 className="font-display text-xl font-bold text-white">Dashboard</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-low)' }}>
          Состояние Infy в реальном времени
        </p>
      </div>

      {error !== null && <div className="mb-4"><ErrorMessage error={error} /></div>}

      {!stats && error === null ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="glass rounded-2xl h-[104px] animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      ) : stats && (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <KpiCard index={0} label="Пользователи" value={stats.totalUsers}
              delta={stats.newUsers7d > 0 ? `+${stats.newUsers7d} за 7 дней` : undefined} />
            <KpiCard index={1} label="В сети" value={stats.onlineNow} live />
            <KpiCard index={2} label="Сообщения" value={stats.totalMessages}
              delta={stats.messages24h > 0 ? `+${stats.messages24h} за 24 ч` : undefined} />
            <KpiCard index={3} label="Активные сессии" value={stats.activeSessions} />
          </div>

          {/* Графики + контейнеры */}
          <div className="grid lg:grid-cols-3 gap-3">
            <ChartCard
              index={4}
              title="Сообщения за неделю"
              data={stats.byDay.map(d => ({ label: d.date, value: d.messages }))}
            />
            <ChartCard
              index={5}
              title="Регистрации за неделю"
              data={stats.byDay.map(d => ({ label: d.date, value: d.users }))}
            />
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32, delay: 0.18 }}
              className="glass rounded-2xl p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-low)' }}>
                  Контейнеры
                </p>
                <Link to="/admin/containers" className="text-xs transition-colors hover:text-white"
                  style={{ color: '#C084FC' }}>
                  Все →
                </Link>
              </div>
              {containers === null ? (
                <div className="flex justify-center py-6"><Spinner size={18} /></div>
              ) : containers.length === 0 ? (
                <p className="text-xs py-4" style={{ color: 'var(--text-low)' }}>Нет данных</p>
              ) : (
                <div className="space-y-2">
                  {containers.slice(0, 6).map(c => (
                    <div key={c.id} className="flex items-center gap-2.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${c.state === 'running' ? 'animate-pulse' : ''}`}
                        style={{ background: c.state === 'running' ? '#22C55E' : c.state === 'paused' ? '#F59E0B' : '#64748B' }} />
                      <p className="text-xs font-mono text-white/80 truncate flex-1">
                        {c.names[0] ?? c.id.slice(0, 12)}
                      </p>
                      <p className="text-[10px] shrink-0" style={{ color: 'var(--text-low)' }}>{c.state}</p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>

          {/* Вторая линия KPI */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
            <KpiCard index={6} label="Чаты" value={stats.totalChats} />
            <KpiCard index={7} label="За 24 часа" value={stats.messages24h} suffix="сообщ." />
            <KpiCard index={8} label="Новые за 7 дней" value={stats.newUsers7d} suffix="польз." />
          </div>
        </>
      )}
    </div>
  )
}

// ── KPI-карточка ─────────────────────────────────────────────

function KpiCard({ label, value, delta, suffix, live, index }: {
  label: string
  value: number
  delta?: string
  suffix?: string
  live?: boolean
  index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32, delay: index * 0.04 }}
      whileHover={{ y: -2 }}
      className="glass rounded-2xl p-4"
    >
      <div className="flex items-center gap-1.5 mb-2">
        {live && <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#22C55E' }} />}
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-low)' }}>
          {label}
        </p>
      </div>
      <p className="font-display text-[28px] font-bold leading-none text-white">
        {value.toLocaleString('ru-RU')}
        {suffix && <span className="text-sm font-normal ml-1.5" style={{ color: 'var(--text-low)' }}>{suffix}</span>}
      </p>
      {delta && (
        <p className="text-xs mt-2 inline-flex px-1.5 py-0.5 rounded-full"
          style={{ background: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>
          ↗ {delta}
        </p>
      )}
    </motion.div>
  )
}

// ── Карточка с бар-чартом за 7 дней ──────────────────────────

function ChartCard({ title, data, index }: {
  title: string
  data: Array<{ label: string; value: number }>
  index: number
}) {
  const max = Math.max(...data.map(d => d.value), 1)
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32, delay: index * 0.03 }}
      className="glass rounded-2xl p-4"
    >
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-low)' }}>
          {title}
        </p>
        <p className="font-display text-lg font-bold text-white">{total.toLocaleString('ru-RU')}</p>
      </div>
      <div className="flex items-end gap-1.5 h-20">
        {data.map((d, i) => {
          const day = new Date(d.label)
          const isToday = i === data.length - 1
          return (
            <div key={d.label} className="flex-1 flex flex-col items-center gap-1 min-w-0"
              title={`${d.label}: ${d.value}`}>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${Math.max((d.value / max) * 100, 4)}%` }}
                transition={{ type: 'spring', stiffness: 260, damping: 28, delay: 0.15 + i * 0.05 }}
                className="w-full rounded-t-md"
                style={{
                  background: isToday
                    ? 'linear-gradient(180deg, #C084FC 0%, #7C3AED 100%)'
                    : 'rgba(168,85,247,0.35)',
                  boxShadow: isToday ? '0 0 12px rgba(124,58,237,0.4)' : 'none',
                  minHeight: 3,
                }}
              />
              <p className="text-[9px] leading-none" style={{ color: 'var(--text-low)' }}>
                {day.toLocaleDateString('ru-RU', { weekday: 'short' })}
              </p>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}

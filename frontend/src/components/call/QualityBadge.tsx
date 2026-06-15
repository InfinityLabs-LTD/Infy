import type { ConnectionQuality } from '@/lib/webrtc'

// Индикатор качества соединения: цвет + сигнальные полоски + детали.
export function QualityBadge({ quality }: { quality: ConnectionQuality | null }) {
  if (!quality) return null
  const color = quality.level === 'good' ? '#22C55E' : quality.level === 'medium' ? '#FBBF24' : '#EF4444'
  const label = quality.level === 'good' ? 'Отлично' : quality.level === 'medium' ? 'Средне' : 'Плохое соединение'
  const bars = quality.level === 'good' ? 3 : quality.level === 'medium' ? 2 : 1

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
      style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-end gap-0.5 h-3.5">
        {[1, 2, 3].map(i => (
          <span key={i} style={{
            width: 3,
            height: 4 + i * 3.5,
            borderRadius: 1,
            background: i <= bars ? color : 'rgba(255,255,255,0.18)',
            transition: 'background 0.3s',
          }} />
        ))}
      </div>
      <span className="text-[11px] font-medium" style={{ color }}>{label}</span>
      {quality.rttMs !== null && (
        <span className="text-[11px] text-white/40">· {quality.rttMs} мс</span>
      )}
      {quality.packetLossPct > 0 && (
        <span className="text-[11px] text-white/40">· потери {quality.packetLossPct}%</span>
      )}
    </div>
  )
}

import { motion, AnimatePresence } from 'framer-motion'
import { Phone, PhoneOff, Video } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '@/components/ui/Avatar'
import { useCallStore } from '@/store/call'
import { callController } from '@/lib/callController'

export function IncomingCallBanner() {
  const navigate = useNavigate()
  const phase = useCallStore((s) => s.phase)
  const peer = useCallStore((s) => s.peer)
  const media = useCallStore((s) => s.media)

  const visible = phase === 'incoming'

  return (
    <AnimatePresence>
      {visible && peer && (
        <motion.div
          key="incoming-banner"
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="fixed top-3 left-1/2 z-[200] w-full max-w-sm -translate-x-1/2 px-3 sm:px-0"
        >
          <div
            className="relative overflow-hidden rounded-2xl px-4 py-3 flex items-center gap-3"
            style={{
              background: 'linear-gradient(135deg, rgba(18,12,38,0.97) 0%, rgba(30,16,60,0.97) 100%)',
              border: '1px solid rgba(168,85,247,0.35)',
              boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(168,85,247,0.15)',
              backdropFilter: 'blur(20px) saturate(160%)',
              WebkitBackdropFilter: 'blur(20px) saturate(160%)',
            }}
          >
            {/* Фоновый пульс */}
            <span
              className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{ animation: 'bannerGlow 2.4s ease-in-out infinite' }}
            />

            {/* Аватар с пульсирующим кольцом */}
            <div className="relative shrink-0">
              <span
                className="absolute inset-0 rounded-full"
                style={{ animation: 'callRipple 2s ease-out infinite' }}
              />
              <div
                className="rounded-full p-[2px]"
                style={{ background: 'var(--grad-own)', boxShadow: '0 0 18px rgba(124,58,237,0.5)' }}
              >
                <Avatar url={peer.avatarUrl} nickname={peer.nickname} size={44} />
              </div>
            </div>

            {/* Текст */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate" style={{ color: 'rgba(168,85,247,0.9)' }}>
                {media === 'VIDEO' ? '📹 Входящий видеозвонок' : '📞 Входящий звонок'}
              </p>
              <p className="text-[15px] font-semibold text-white truncate leading-tight mt-0.5">
                {peer.nickname}
              </p>
            </div>

            {/* Кнопки */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Отклонить */}
              <button
                onClick={() => callController.decline()}
                title="Отклонить"
                className="flex items-center justify-center rounded-full transition-all duration-150 active:scale-90"
                style={{
                  width: 42, height: 42,
                  background: 'linear-gradient(135deg,#EF4444,#DC2626)',
                  boxShadow: '0 4px 16px rgba(239,68,68,0.45)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
              >
                <PhoneOff size={18} />
              </button>

              {/* Принять */}
              <button
                onClick={() => callController.accept()}
                title="Принять"
                className="flex items-center justify-center rounded-full transition-all duration-150 active:scale-90"
                style={{
                  width: 42, height: 42,
                  background: 'linear-gradient(135deg,#22C55E,#16A34A)',
                  boxShadow: '0 4px 16px rgba(34,197,94,0.5)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.12)',
                  animation: 'callPulse 1.6s ease-in-out infinite',
                }}
              >
                {media === 'VIDEO' ? <Video size={18} /> : <Phone size={18} />}
              </button>
            </div>
          </div>

          {/* Подсказка «ответить сообщением» */}
          <button
            onClick={() => {
              callController.decline()
              navigate(`/chat/${peer.id}`)
            }}
            className="mt-1 w-full text-center text-xs py-1 rounded-xl transition-colors"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            Ответить сообщением
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

import { motion } from 'framer-motion'
import type { Variants } from 'framer-motion'
import { Zap, Video, ShieldCheck, Cloud, Globe2 } from 'lucide-react'
import { InfyLogo } from './InfyLogo'

const FEATURES = [
  { icon: Zap, label: 'Мгновенная доставка сообщений' },
  { icon: Video, label: 'HD видеозвонки' },
  { icon: ShieldCheck, label: 'Сквозное шифрование' },
  { icon: Cloud, label: 'Синхронизация между устройствами' },
  { icon: Globe2, label: 'Безграничное общение' },
]

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.3 } },
}
const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.32, 0.72, 0, 1] } },
}

/**
 * Левый бренд-блок: логотип, hero-заголовок, подзаголовок и список
 * особенностей в отдельных glass-карточках.
 */
export function AuthBrandPanel() {
  return (
    <div className="relative hidden w-full flex-col justify-center px-10 py-12 lg:flex xl:px-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
      >
        <div className="mb-8 flex items-center gap-4">
          <InfyLogo size={64} />
          <span className="text-2xl font-bold tracking-tight text-white/90">Infy</span>
        </div>

        <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight text-white xl:text-6xl">
          Infy
          <span
            className="ml-3 bg-clip-text text-transparent"
            style={{ backgroundImage: 'linear-gradient(135deg,#B388FF,#7C4DFF)' }}
          >
            Messenger
          </span>
        </h1>
        <p className="mt-5 max-w-md text-lg leading-relaxed text-white/55">
          Связь нового поколения для команд, друзей и близких.
        </p>
      </motion.div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="mt-10 grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {FEATURES.map(({ icon: Icon, label }) => (
          <motion.div
            key={label}
            variants={item}
            whileHover={{ y: -3, transition: { duration: 0.3 } }}
            className="auth-feature flex items-center gap-3 px-4 py-3.5"
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{
                background: 'rgba(124,77,255,0.25)',
                border: '1px solid rgba(179,136,255,0.35)',
              }}
            >
              <Icon size={17} className="text-[#D8CCFF]" strokeWidth={2} />
            </span>
            <span className="text-sm font-medium text-white/80">{label}</span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}

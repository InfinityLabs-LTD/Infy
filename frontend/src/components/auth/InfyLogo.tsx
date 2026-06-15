import { motion } from 'framer-motion'

/**
 * Брендовый символ Infy — стилизованная «бесконечность» из двух
 * переплетённых liquid-glass петель: соединение, сеть, коммуникация.
 * Рисуется через SVG с градиентом и мягким свечением.
 */
export function InfyLogo({ size = 64 }: { size?: number }) {
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Свечение позади знака */}
      <div
        className="auth-pulse absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(124,77,255,0.55), transparent 70%)',
          filter: 'blur(14px)',
        }}
      />
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        fill="none"
        className="relative drop-shadow-[0_6px_20px_rgba(124,77,255,0.5)]"
      >
        <defs>
          <linearGradient id="infyGrad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#B388FF" />
            <stop offset="50%" stopColor="#9D6BFF" />
            <stop offset="100%" stopColor="#7C4DFF" />
          </linearGradient>
          <linearGradient id="infyShine" x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        {/* Знак бесконечности — две петли */}
        <motion.path
          d="M28 50 C28 34, 50 34, 50 50 C50 66, 72 66, 72 50 C72 34, 50 34, 50 50 C50 66, 28 66, 28 50 Z"
          stroke="url(#infyGrad)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.4, ease: [0.32, 0.72, 0, 1] }}
        />
        {/* Стеклянный блик сверху по знаку */}
        <path
          d="M28 50 C28 34, 50 34, 50 50 C50 66, 72 66, 72 50 C72 34, 50 34, 50 50 C50 66, 28 66, 28 50 Z"
          stroke="url(#infyShine)"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.55"
        />
        {/* Узлы-точки сети на концах петель */}
        <circle cx="28" cy="50" r="4.5" fill="#fff" opacity="0.95" />
        <circle cx="72" cy="50" r="4.5" fill="#fff" opacity="0.95" />
        <circle cx="50" cy="50" r="3.5" fill="#EDE7FF" />
      </svg>
    </div>
  )
}

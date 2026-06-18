import { motion } from 'framer-motion'

/**
 * Брендовый знак Infy — liquid-glass логотип (logo.png) в фирменном
 * скруглённом квадрате. Рендерим само изображение с мягким фиолетовым
 * свечением позади, сохраняя квадратные пропорции исходника.
 */
export function InfyLogo({ size = 64 }: { size?: number }) {
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Свечение позади знака */}
      <div
        className="auth-pulse absolute inset-0 rounded-[28%]"
        style={{
          background: 'radial-gradient(circle, rgba(124,77,255,0.55), transparent 70%)',
          filter: 'blur(14px)',
        }}
      />
      <motion.img
        src="/logo.png"
        alt="Infy"
        width={size}
        height={size}
        draggable={false}
        className="relative rounded-[24%] drop-shadow-[0_6px_20px_rgba(124,77,255,0.5)]"
        style={{ width: size, height: size, objectFit: 'contain' }}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
      />
    </div>
  )
}

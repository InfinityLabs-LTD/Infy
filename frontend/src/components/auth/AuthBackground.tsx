/**
 * Декоративный фон страниц авторизации: глубокий брендовый градиент,
 * плавающие стеклянные сферы, световые блики и стеклянные панели на
 * заднем плане. Создаёт ощущение глубины и слоёности (visionOS-style).
 */
export function AuthBackground() {
  return (
    <div className="auth-bg pointer-events-none absolute inset-0 overflow-hidden">
      {/* Плавающие стеклянные сферы */}
      <div
        className="auth-orb auth-float-a"
        style={{ width: 320, height: 320, top: '-6%', left: '-4%' }}
      />
      <div
        className="auth-orb auth-float-b"
        style={{ width: 220, height: 220, bottom: '8%', left: '18%', opacity: 0.7 }}
      />
      <div
        className="auth-orb auth-float-c"
        style={{ width: 420, height: 420, bottom: '-12%', right: '-8%', opacity: 0.55 }}
      />
      <div
        className="auth-orb auth-float-b"
        style={{ width: 160, height: 160, top: '14%', right: '24%', opacity: 0.5 }}
      />

      {/* Полупрозрачные стеклянные панели на фоне для глубины */}
      <div
        className="auth-float-c absolute rounded-[40px]"
        style={{
          width: 280,
          height: 380,
          top: '22%',
          right: '12%',
          transform: 'rotate(-14deg)',
          background: 'rgba(255,255,255,0.025)',
          border: '1px solid rgba(255,255,255,0.06)',
          backdropFilter: 'blur(6px)',
        }}
      />
      <div
        className="auth-float-a absolute rounded-[32px]"
        style={{
          width: 200,
          height: 260,
          bottom: '16%',
          left: '8%',
          transform: 'rotate(10deg)',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)',
          backdropFilter: 'blur(6px)',
        }}
      />

      {/* Тонкая сетка-вуаль поверх для технологичности */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '54px 54px',
          maskImage: 'radial-gradient(circle at 50% 50%, black, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(circle at 50% 50%, black, transparent 75%)',
        }}
      />
    </div>
  )
}

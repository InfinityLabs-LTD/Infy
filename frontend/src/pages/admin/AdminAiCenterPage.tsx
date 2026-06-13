import { AdminComingSoon } from './AdminComingSoon'

export function AdminAiCenterPage() {
  return (
    <AdminComingSoon
      title="AI Center"
      badge="Скоро"
      subtitle="Управление AI-функциями Infy: умные ответы, сводки диалогов, перевод и семантический поиск. Здесь будет контроль использования, стоимости и нагрузки моделей."
      heroIcon={
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
        </svg>
      }
      preview={[
        { label: 'Запросов / сутки', placeholder: '—' },
        { label: 'Стоимость / мес', placeholder: '—' },
        { label: 'Средняя латентность', placeholder: '—' },
        { label: 'Активных моделей', placeholder: '—' },
      ]}
      features={[
        {
          title: 'Использование и стоимость',
          desc: 'Графики запросов, токенов и расходов по моделям. Лимиты и алерты при превышении бюджета.',
          icon: <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
        },
        {
          title: 'Управление моделями',
          desc: 'Выбор моделей для каждой функции (сводки, smart-replies, перевод), переключение версий, A/B.',
          icon: <><circle cx="12" cy="12" r="3" /><path d="M12 1v6M12 17v6M4.2 4.2l4.3 4.3M15.5 15.5l4.3 4.3M1 12h6M17 12h6" /></>,
        },
        {
          title: 'Нагрузка и здоровье',
          desc: 'Латентность, очередь, доля ошибок в реальном времени. Авто-фоллбэк на резервную модель.',
          icon: <><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></>,
        },
      ]}
    />
  )
}

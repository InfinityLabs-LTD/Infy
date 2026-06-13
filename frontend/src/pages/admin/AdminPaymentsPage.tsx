import { AdminComingSoon } from './AdminComingSoon'

export function AdminPaymentsPage() {
  return (
    <AdminComingSoon
      title="Платежи"
      badge="Скоро"
      subtitle="Подписки Infy Premium, разовые покупки и выплаты. Управление тарифами, история транзакций, возвраты и финансовая отчётность."
      heroIcon={
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
        </svg>
      }
      preview={[
        { label: 'MRR', placeholder: '—' },
        { label: 'Подписчиков', placeholder: '—' },
        { label: 'Транзакций / мес', placeholder: '—' },
        { label: 'Churn', placeholder: '—' },
      ]}
      features={[
        {
          title: 'Подписки',
          desc: 'Тарифы Premium, статусы подписок, продления и отмены. Управление пробными периодами.',
          icon: <><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></>,
        },
        {
          title: 'Транзакции',
          desc: 'История платежей, фильтры по статусу и методу, ручные возвраты и поиск по пользователю.',
          icon: <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></>,
        },
        {
          title: 'Отчётность',
          desc: 'MRR, ARR, churn и LTV. Выгрузка для бухгалтерии, разбивка дохода по тарифам и регионам.',
          icon: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></>,
        },
      ]}
    />
  )
}

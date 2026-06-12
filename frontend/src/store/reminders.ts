import { create } from 'zustand'

// Входящее напоминание, доставленное воркером через socket (`reminder_due`).
export interface DueReminder {
  reminderId: string
  eventId: string
  chatId: string
  title: string
  notes: string | null
  eventAt: string
  allDay: boolean
  offsetMin: number
  categoryName: string
  from: { id: string; nickname: string }
  receivedAt: number
}

interface ReminderState {
  toasts: DueReminder[]
  pushReminder: (r: Omit<DueReminder, 'receivedAt'>) => void
  dismiss: (reminderId: string) => void
}

export const useReminderStore = create<ReminderState>((set) => ({
  toasts: [],
  pushReminder: (r) =>
    set((s) => {
      if (s.toasts.some(t => t.reminderId === r.reminderId)) return s
      return { toasts: [...s.toasts, { ...r, receivedAt: Date.now() }] }
    }),
  dismiss: (reminderId) =>
    set((s) => ({ toasts: s.toasts.filter(t => t.reminderId !== reminderId) })),
}))

import { api } from './client'

export type ReminderTarget = 'SELF' | 'PARTNER' | 'BOTH'

export interface CategoryPreset {
  key: string
  name: string
  color: string
  icon: string
}

export interface CustomCategory {
  id: string
  name: string
  color: string
  createdById: string
  createdAt: string
}

export interface EventReminder {
  id?: string
  offsetMin: number
  target: ReminderTarget
  notify: boolean
  fireAt?: string
  sentAt?: string | null
}

export interface CalendarEvent {
  id: string
  chatId: string
  title: string
  notes: string | null
  eventAt: string
  allDay: boolean
  presetKey: string | null
  categoryId: string | null
  category: { id: string; name: string; color: string } | null
  createdBy: { id: string; username: string; nickname: string; avatarUrl: string | null }
  reminders: EventReminder[]
  createdAt: string
  updatedAt: string
}

export interface EventInput {
  title: string
  notes?: string | null
  eventAt: string
  allDay?: boolean
  presetKey?: string | null
  categoryId?: string | null
  reminders: { offsetMin: number; target: ReminderTarget; notify: boolean }[]
}

export const calendarApi = {
  listEvents: (chatId: string, from?: string, to?: string) =>
    api.get<{ data: CalendarEvent[] }>(`/calendar/${chatId}/events`, { params: { from, to } }),

  createEvent: (chatId: string, input: EventInput) =>
    api.post<{ data: CalendarEvent }>(`/calendar/${chatId}/events`, input),

  updateEvent: (eventId: string, input: EventInput) =>
    api.put<{ data: CalendarEvent }>(`/calendar/events/${eventId}`, input),

  deleteEvent: (eventId: string) =>
    api.delete(`/calendar/events/${eventId}`),

  listCategories: (chatId: string) =>
    api.get<{ data: { presets: CategoryPreset[]; custom: CustomCategory[] } }>(
      `/calendar/${chatId}/categories`,
    ),

  createCategory: (chatId: string, name: string, color: string) =>
    api.post<{ data: CustomCategory }>(`/calendar/${chatId}/categories`, { name, color }),

  deleteCategory: (categoryId: string) =>
    api.delete(`/calendar/categories/${categoryId}`),

  getSettings: (chatId: string) =>
    api.get<{ data: { remindersEnabled: boolean } }>(`/calendar/${chatId}/settings`),

  updateSettings: (chatId: string, remindersEnabled: boolean) =>
    api.patch<{ data: { remindersEnabled: boolean } }>(`/calendar/${chatId}/settings`, {
      remindersEnabled,
    }),
}

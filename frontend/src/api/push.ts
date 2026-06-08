import { api } from './client'

export const pushApi = {
  getVapidPublicKey: () =>
    api.get<{ data: { publicKey: string } }>('/push/vapid-public-key'),

  subscribe: (endpoint: string, p256dh: string, auth: string) =>
    api.post('/push/subscribe', { endpoint, p256dh, auth }),

  unsubscribe: (endpoint: string) =>
    api.delete('/push/subscribe', { data: { endpoint } }),
}

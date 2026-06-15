import { api } from './client'
import type { IceServer } from '@/lib/webrtc'

export type CallMedia = 'AUDIO' | 'VIDEO'
export type CallStatus = 'RINGING' | 'ACTIVE' | 'ENDED' | 'MISSED' | 'DECLINED' | 'CANCELLED' | 'FAILED'

export interface CallHistoryItem {
  id: string
  chatId: string
  media: CallMedia
  status: CallStatus
  direction: 'incoming' | 'outgoing'
  missed: boolean
  durationSec: number
  createdAt: string
  answeredAt: string | null
  endedAt: string | null
  peer: { id: string; username: string; nickname: string; avatarUrl: string | null }
}

export const callsApi = {
  // ICE-серверы запрашиваем прямо перед стартом соединения (TURN-creds истекают).
  getIceServers: () =>
    api.get<{ data: { iceServers: IceServer[] } }>('/calls/ice'),

  getHistory: (cursor?: string, limit = 30) =>
    api.get<{ data: { calls: CallHistoryItem[]; nextCursor: string | null } }>('/calls/history', {
      params: { cursor, limit },
    }),
}

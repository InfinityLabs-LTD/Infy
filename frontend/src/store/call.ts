import { create } from 'zustand'
import type { CallMedia } from '@/api/calls'
import type { ConnectionQuality } from '@/lib/webrtc'

// Фаза звонка с точки зрения UI.
//  idle      — нет звонка
//  outgoing  — мы звоним, ждём ответа (экран исходящего)
//  incoming  — нам звонят (экран входящего)
//  connecting— приняли, устанавливаем соединение
//  active    — идёт разговор
//  ended     — короткий финальный экран перед закрытием
export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended'

export interface CallPeer {
  id: string
  username: string
  nickname: string
  avatarUrl: string | null
}

export interface CallState {
  phase: CallPhase
  callId: string | null
  chatId: string | null
  media: CallMedia
  peer: CallPeer | null
  // true если мы инициатор
  isCaller: boolean

  // Управление медиа (наше состояние)
  micOn: boolean
  camOn: boolean
  screenOn: boolean
  // Состояние медиа собеседника (приходит по сигналингу)
  peerMicOn: boolean
  peerCamOn: boolean
  peerScreenOn: boolean

  // Качество соединения
  quality: ConnectionQuality | null
  // Длительность разговора в секундах (тикает на active)
  durationSec: number
  // Причина завершения для финального экрана
  endedReason: string | null

  // Потоки (хранятся как ref-объекты, перерисовка по version-счётчику)
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  streamVersion: number

  // Выбранное устройство вывода звука (deviceId). Пусто = устройство по умолчанию.
  // Применяется к удалённому <audio> через setSinkId (не поддерживается на iOS Safari).
  audioOutputId: string
}

interface CallActions {
  startOutgoing: (p: { callId: string; chatId: string; media: CallMedia; peer: CallPeer }) => void
  receiveIncoming: (p: { callId: string; chatId: string; media: CallMedia; peer: CallPeer }) => void
  setPhase: (phase: CallPhase) => void
  setMic: (on: boolean) => void
  setCam: (on: boolean) => void
  setScreen: (on: boolean) => void
  setPeerMedia: (p: { micOn?: boolean; camOn?: boolean; screenOn?: boolean }) => void
  setQuality: (q: ConnectionQuality) => void
  tickDuration: () => void
  setStreams: (local: MediaStream | null, remote: MediaStream | null) => void
  bumpStreams: () => void
  setAudioOutput: (deviceId: string) => void
  end: (reason: string | null) => void
  reset: () => void
}

const initial: CallState = {
  phase: 'idle',
  callId: null,
  chatId: null,
  media: 'AUDIO',
  peer: null,
  isCaller: false,
  micOn: true,
  camOn: false,
  screenOn: false,
  peerMicOn: true,
  peerCamOn: false,
  peerScreenOn: false,
  quality: null,
  durationSec: 0,
  endedReason: null,
  localStream: null,
  remoteStream: null,
  streamVersion: 0,
  audioOutputId: '',
}

export const useCallStore = create<CallState & CallActions>((set) => ({
  ...initial,

  startOutgoing: ({ callId, chatId, media, peer }) =>
    set({
      ...initial,
      phase: 'outgoing',
      callId, chatId, media, peer,
      isCaller: true,
      camOn: media === 'VIDEO',
      // В видеозвонке считаем камеру собеседника включённой, пока он явно не выключит.
      peerCamOn: media === 'VIDEO',
    }),

  receiveIncoming: ({ callId, chatId, media, peer }) =>
    set({
      ...initial,
      phase: 'incoming',
      callId, chatId, media, peer,
      isCaller: false,
      camOn: media === 'VIDEO',
      peerCamOn: media === 'VIDEO',
    }),

  setPhase: (phase) => set({ phase }),
  setMic: (on) => set({ micOn: on }),
  setCam: (on) => set({ camOn: on }),
  setScreen: (on) => set({ screenOn: on }),
  setPeerMedia: (p) => set((s) => ({
    peerMicOn: p.micOn ?? s.peerMicOn,
    peerCamOn: p.camOn ?? s.peerCamOn,
    peerScreenOn: p.screenOn ?? s.peerScreenOn,
  })),
  setQuality: (quality) => set({ quality }),
  tickDuration: () => set((s) => ({ durationSec: s.durationSec + 1 })),
  setStreams: (local, remote) => set((s) => ({
    localStream: local, remoteStream: remote, streamVersion: s.streamVersion + 1,
  })),
  bumpStreams: () => set((s) => ({ streamVersion: s.streamVersion + 1 })),
  setAudioOutput: (deviceId) => set({ audioOutputId: deviceId }),
  end: (reason) => set({ phase: 'ended', endedReason: reason }),
  reset: () => set({ ...initial }),
}))

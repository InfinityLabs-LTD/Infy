import { io, Socket } from 'socket.io-client'
import { socketUrl } from '@/lib/origin'

// Адрес сокета определяется в рантайме (см. lib/origin.ts):
// на CDN-домене WebSocket идёт на основной домен (минуя CDN), иначе — на текущий origin.
let socket: Socket | null = null
// Токен, с которым создано текущее соединение. Нужен, чтобы при СМЕНЕ аккаунта
// (тот же таб, новый login) пересоздать сокет: иначе старое соединение остаётся
// аутентифицированным прежним пользователем, и сообщения уходят от его имени.
let socketToken: string | null = null

export function getSocket(token: string): Socket {
  // Живой сокет переиспользуем только если токен тот же. При другом токене
  // (сменился пользователь) — рвём старое соединение и поднимаем новое.
  if (socket && socketToken === token) return socket
  if (socket) { socket.disconnect(); socket = null }
  socketToken = token

  socket = io(socketUrl(), {
    auth: { token },
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  })

  const ping = setInterval(() => {
    if (socket?.connected) socket.emit('ping')
  }, 25_000)

  socket.on('disconnect', () => clearInterval(ping))

  return socket
}

export function getActiveSocket(): Socket | null {
  return socket
}

export function joinChatRoom(chatId: string): void {
  if (!socket) return
  if (socket.connected) {
    socket.emit('join_chat', chatId)
  } else {
    socket.once('connect', () => socket?.emit('join_chat', chatId))
  }
}

export function disconnectSocket(): void {
  socket?.disconnect()
  socket = null
  socketToken = null
}

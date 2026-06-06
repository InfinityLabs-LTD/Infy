import { io, Socket } from 'socket.io-client'

// VITE_SOCKET_URL is baked in at build time.
// On the CDN build it points to the main domain so WebSocket bypasses the CDN.
// For local dev it is empty (connects to current origin).
let socket: Socket | null = null

export function getSocket(token: string): Socket {
  if (socket?.connected) return socket

  socket = io({
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
}

import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(token: string): Socket {
  if (socket?.connected) return socket

  socket = io({
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  })

  // Keep presence alive
  const ping = setInterval(() => {
    if (socket?.connected) socket.emit('ping')
  }, 25_000)

  socket.on('disconnect', () => clearInterval(ping))

  return socket
}

export function disconnectSocket(): void {
  socket?.disconnect()
  socket = null
}

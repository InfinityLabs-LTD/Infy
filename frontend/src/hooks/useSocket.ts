import { useEffect, useRef } from 'react'
import { Socket } from 'socket.io-client'
import { getSocket, disconnectSocket } from '@/lib/socket'
import { useAuthStore } from '@/store/auth'
import { useChatStore } from '@/store/chat'

export function useSocket(): Socket | null {
  const accessToken = useAuthStore((s) => s.accessToken)
  const socketRef = useRef<Socket | null>(null)

  const { addMessage, updateMessage, removeMessage, setUserOnline, setUserOffline } = useChatStore()

  useEffect(() => {
    if (!accessToken) return

    const socket = getSocket(accessToken)
    socketRef.current = socket

    socket.on('message_new', (msg) => addMessage(msg))
    socket.on('message_edited', (msg) => updateMessage(msg))
    socket.on('message_deleted', ({ id, chatId }: { id: string; chatId: string }) =>
      removeMessage(chatId, id))
    socket.on('user_online', ({ userId }: { userId: string }) => setUserOnline(userId))
    socket.on('user_offline', ({ userId, lastSeenAt }: { userId: string; lastSeenAt: string }) =>
      setUserOffline(userId, lastSeenAt))

    return () => {
      socket.off('message_new')
      socket.off('message_edited')
      socket.off('message_deleted')
      socket.off('user_online')
      socket.off('user_offline')
    }
  }, [accessToken])

  // Disconnect on logout
  useEffect(() => {
    if (!accessToken) disconnectSocket()
  }, [accessToken])

  return socketRef.current
}

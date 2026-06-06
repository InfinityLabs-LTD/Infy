import { useEffect, useRef } from 'react'
import { Socket } from 'socket.io-client'
import { getSocket, disconnectSocket } from '@/lib/socket'
import { useAuthStore } from '@/store/auth'
import { useChatStore } from '@/store/chat'
import type { Message } from '@/store/chat'

export function useSocket(): Socket | null {
  const accessToken = useAuthStore((s) => s.accessToken)
  const socketRef = useRef<Socket | null>(null)

  const { addMessage, updateMessage, removeMessage, setUserOnline, setUserOffline } = useChatStore()

  useEffect(() => {
    if (!accessToken) return

    const socket = getSocket(accessToken)
    socketRef.current = socket

    const onMessageNew = (msg: Message) => addMessage(msg)
    const onMessageEdited = (msg: Message) => updateMessage(msg)
    const onMessageDeleted = ({ id, chatId }: { id: string; chatId: string }) => removeMessage(chatId, id)
    const onUserOnline = ({ userId }: { userId: string }) => setUserOnline(userId)
    const onUserOffline = ({ userId, lastSeenAt }: { userId: string; lastSeenAt: string }) => setUserOffline(userId, lastSeenAt)

    socket.on('message_new', onMessageNew)
    socket.on('message_edited', onMessageEdited)
    socket.on('message_deleted', onMessageDeleted)
    socket.on('user_online', onUserOnline)
    socket.on('user_offline', onUserOffline)

    return () => {
      socket.off('message_new', onMessageNew)
      socket.off('message_edited', onMessageEdited)
      socket.off('message_deleted', onMessageDeleted)
      socket.off('user_online', onUserOnline)
      socket.off('user_offline', onUserOffline)
    }
  }, [accessToken])

  useEffect(() => {
    if (!accessToken) disconnectSocket()
  }, [accessToken])

  return socketRef.current
}

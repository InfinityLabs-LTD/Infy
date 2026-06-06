import { useEffect, useRef } from 'react'
import { Socket } from 'socket.io-client'
import { getSocket, disconnectSocket } from '@/lib/socket'
import { useAuthStore } from '@/store/auth'
import { useChatStore } from '@/store/chat'
import type { Message } from '@/store/chat'

export function useSocket(): Socket | null {
  const accessToken = useAuthStore((s) => s.accessToken)
  const socketRef = useRef<Socket | null>(null)

  const { addMessage, updateMessage, removeMessage, setUserOnline, setUserOffline, setSocketReady } = useChatStore()

  useEffect(() => {
    if (!accessToken) return

    const socket = getSocket(accessToken)
    socketRef.current = socket

    const onMessageNew = (msg: Message) => addMessage(msg)
    const onMessageEdited = (msg: Message) => updateMessage(msg)
    const onMessageDeleted = ({ id, chatId }: { id: string; chatId: string }) => removeMessage(chatId, id)
    const onUserOnline = ({ userId }: { userId: string }) => setUserOnline(userId)
    const onUserOffline = ({ userId, lastSeenAt }: { userId: string; lastSeenAt: string }) => setUserOffline(userId, lastSeenAt)
    const onOnlineUsers = ({ userIds }: { userIds: string[] }) => userIds.forEach(id => setUserOnline(id))
    const onConnect = () => setSocketReady(true)
    const onDisconnect = () => setSocketReady(false)

    socket.on('message_new', onMessageNew)
    socket.on('message_edited', onMessageEdited)
    socket.on('message_deleted', onMessageDeleted)
    socket.on('user_online', onUserOnline)
    socket.on('user_offline', onUserOffline)
    socket.on('online_users', onOnlineUsers)
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)

    if (socket.connected) setSocketReady(true)

    return () => {
      socket.off('message_new', onMessageNew)
      socket.off('message_edited', onMessageEdited)
      socket.off('message_deleted', onMessageDeleted)
      socket.off('user_online', onUserOnline)
      socket.off('user_offline', onUserOffline)
      socket.off('online_users', onOnlineUsers)
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      setSocketReady(false)
    }
  }, [accessToken])

  useEffect(() => {
    if (!accessToken) disconnectSocket()
  }, [accessToken])

  return socketRef.current
}

import { useEffect, useRef } from 'react'
import { Socket } from 'socket.io-client'
import { getSocket, disconnectSocket } from '@/lib/socket'
import { useAuthStore } from '@/store/auth'
import { useChatStore } from '@/store/chat'
import { useReminderStore, type DueReminder } from '@/store/reminders'
import type { Message } from '@/store/chat'

export function useSocket(): Socket | null {
  const accessToken = useAuthStore((s) => s.accessToken)
  const socketRef = useRef<Socket | null>(null)

  const {
    addMessage, updateMessage, removeMessage,
    setUserOnline, setUserOffline, setSocketReady,
    updatePartnerRead,
  } = useChatStore()

  useEffect(() => {
    if (!accessToken) return

    const socket = getSocket(accessToken)
    socketRef.current = socket

    const onMessageNew = (msg: Message) => {
      addMessage(msg)
      // Browser notification when tab is not focused
      const myId = useAuthStore.getState().user?.id
      if (document.hidden && msg.sender.id !== myId && Notification.permission === 'granted') {
        new Notification(msg.sender.nickname, {
          body: msg.type === 'TEXT' ? (msg.content ?? '') : '📎 Вложение',
          icon: msg.sender.avatarUrl ?? '/icon.svg',
          tag: msg.chatId,  // replaces previous notification for same chat
        })
      }
    }
    const onMessageEdited = (msg: Message) => updateMessage(msg)
    const onMessageUpdated = (msg: Message) => updateMessage(msg)
    const onMessageDeleted = ({ id, chatId }: { id: string; chatId: string }) => removeMessage(chatId, id)
    const onUserOnline = ({ userId }: { userId: string }) => setUserOnline(userId)
    const onUserOffline = ({ userId, lastSeenAt }: { userId: string; lastSeenAt: string }) => setUserOffline(userId, lastSeenAt)
    const onOnlineUsers = ({ userIds }: { userIds: string[] }) => userIds.forEach(id => setUserOnline(id))
    const onConnect = () => setSocketReady(true)
    const onDisconnect = () => setSocketReady(false)
    const onMessagesRead = ({ chatId, messageId, readAt }: { chatId: string; userId: string; messageId: string; readAt?: string }) => {
      updatePartnerRead(chatId, messageId, readAt)
    }
    const onReminderDue = (r: Omit<DueReminder, 'receivedAt'>) => {
      if (!r?.reminderId) return
      useReminderStore.getState().pushReminder(r)
      // System notification when tab is not focused
      if (document.hidden && Notification.permission === 'granted') {
        new Notification(`📅 ${r.title}`, {
          body: `${r.categoryName}${r.notes ? ` — ${r.notes}` : ''}`,
          icon: '/icon.svg',
          tag: `reminder:${r.reminderId}`,
        })
      }
    }

    socket.on('message_new', onMessageNew)
    socket.on('message_edited', onMessageEdited)
    socket.on('message_updated', onMessageUpdated)
    socket.on('message_deleted', onMessageDeleted)
    socket.on('user_online', onUserOnline)
    socket.on('user_offline', onUserOffline)
    socket.on('online_users', onOnlineUsers)
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('messages_read', onMessagesRead)
    socket.on('reminder_due', onReminderDue)

    if (socket.connected) setSocketReady(true)

    return () => {
      socket.off('message_new', onMessageNew)
      socket.off('message_edited', onMessageEdited)
      socket.off('message_updated', onMessageUpdated)
      socket.off('message_deleted', onMessageDeleted)
      socket.off('user_online', onUserOnline)
      socket.off('user_offline', onUserOffline)
      socket.off('online_users', onOnlineUsers)
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('messages_read', onMessagesRead)
      socket.off('reminder_due', onReminderDue)
      setSocketReady(false)
    }
  }, [accessToken])

  useEffect(() => {
    if (!accessToken) disconnectSocket()
  }, [accessToken])

  return socketRef.current
}

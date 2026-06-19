import { useEffect, useRef } from 'react'
import { Socket } from 'socket.io-client'
import { getSocket, disconnectSocket } from '@/lib/socket'
import { useAuthStore } from '@/store/auth'
import { useChatStore } from '@/store/chat'
import { useReminderStore, type DueReminder } from '@/store/reminders'
import { chatApi } from '@/api/chat'
import type { Message } from '@/store/chat'

export function useSocket(): Socket | null {
  const accessToken = useAuthStore((s) => s.accessToken)
  const socketRef = useRef<Socket | null>(null)

  const {
    addMessage, updateMessage, removeMessage, removeChat,
    setUserOnline, setUserOffline, setSocketReady, setOnlineUsers,
    updatePartnerRead, updateAttachmentListened, upsertChat, resetUnread,
  } = useChatStore()

  useEffect(() => {
    if (!accessToken) return

    const socket = getSocket(accessToken)
    socketRef.current = socket

    const onMessageNew = (msg: Message) => {
      // Сообщение в чат, которого ещё нет в локальном списке (новый диалог) —
      // подтягиваем сам чат, чтобы он появился в сайдбаре без перезагрузки.
      const known = useChatStore.getState().chats.some(c => c.id === msg.chatId)
      if (!known) {
        chatApi.getChat(msg.chatId)
          .then(r => upsertChat(r.data.data))
          .catch(() => { /* не критично */ })
      }
      addMessage(msg)
      // Browser notification when tab is not focused
      const me = useAuthStore.getState().user
      const myId = me?.id
      if (document.hidden && msg.type !== 'SYSTEM' && msg.sender.id !== myId && Notification.permission === 'granted' && (me?.notifyPopup ?? true)) {
        new Notification(msg.sender.nickname, {
          body: msg.type === 'TEXT' ? (msg.content ?? '') : '📎 Вложение',
          icon: msg.sender.avatarUrl ?? '/logo.png',
          tag: msg.chatId,  // replaces previous notification for same chat
          silent: !(me?.notifySound ?? true),
        } as NotificationOptions)
      }
    }
    const onMessageEdited = (msg: Message) => updateMessage(msg)
    const onMessageUpdated = (msg: Message) => updateMessage(msg)
    const onMessageDeleted = ({ id, chatId }: { id: string; chatId: string }) => removeMessage(chatId, id)
    const onChatDeleted = ({ chatId }: { chatId: string }) => {
      removeChat(chatId)
      // Если открыт удалённый чат — уводим пользователя на список.
      window.dispatchEvent(new CustomEvent('chat:deleted', { detail: { chatId } }))
    }
    const onUserOnline = ({ userId }: { userId: string }) => setUserOnline(userId)
    const onUserOffline = ({ userId, lastSeenAt }: { userId: string; lastSeenAt: string }) => setUserOffline(userId, lastSeenAt)
    // Снапшот — это ПОЛНЫЙ список онлайна на момент (ре)коннекта. Замещаем им
    // набор целиком, иначе ушедшие за время простоя оставались бы «в сети» (H-2).
    const onOnlineUsers = ({ userIds }: { userIds: string[] }) => setOnlineUsers(userIds)
    const onConnect = () => setSocketReady(true)
    const onDisconnect = () => setSocketReady(false)
    const onMessagesRead = ({ chatId, userId, messageId, readAt }: { chatId: string; userId: string; messageId: string; readAt?: string }) => {
      const myId = useAuthStore.getState().user?.id
      // Прочтение с другого устройства того же пользователя — синхронизируем
      // локальный счётчик непрочитанного (multi-device read-sync).
      if (userId === myId) {
        resetUnread(chatId)
        return
      }
      updatePartnerRead(chatId, messageId, readAt)
    }
    const onVoiceListened = ({ chatId, messageId, listenedAt }: { chatId: string; messageId: string; listenedAt: string }) => {
      updateAttachmentListened(chatId, messageId, listenedAt)
    }
    const onReminderDue = (r: Omit<DueReminder, 'receivedAt'>) => {
      if (!r?.reminderId) return
      useReminderStore.getState().pushReminder(r)
      // System notification when tab is not focused
      const me = useAuthStore.getState().user
      if (document.hidden && Notification.permission === 'granted' && (me?.notifyPopup ?? true)) {
        new Notification(`📅 ${r.title}`, {
          body: `${r.categoryName}${r.notes ? ` — ${r.notes}` : ''}`,
          icon: '/logo.png',
          tag: `reminder:${r.reminderId}`,
          silent: !(me?.notifySound ?? true),
        } as NotificationOptions)
      }
    }

    socket.on('message_new', onMessageNew)
    socket.on('message_edited', onMessageEdited)
    socket.on('message_updated', onMessageUpdated)
    socket.on('message_deleted', onMessageDeleted)
    socket.on('chat_deleted', onChatDeleted)
    socket.on('user_online', onUserOnline)
    socket.on('user_offline', onUserOffline)
    socket.on('online_users', onOnlineUsers)
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('messages_read', onMessagesRead)
    socket.on('voice_listened', onVoiceListened)
    socket.on('reminder_due', onReminderDue)

    if (socket.connected) setSocketReady(true)

    return () => {
      socket.off('message_new', onMessageNew)
      socket.off('message_edited', onMessageEdited)
      socket.off('message_updated', onMessageUpdated)
      socket.off('message_deleted', onMessageDeleted)
      socket.off('chat_deleted', onChatDeleted)
      socket.off('user_online', onUserOnline)
      socket.off('user_offline', onUserOffline)
      socket.off('online_users', onOnlineUsers)
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('messages_read', onMessagesRead)
      socket.off('voice_listened', onVoiceListened)
      socket.off('reminder_due', onReminderDue)
      setSocketReady(false)
    }
  }, [accessToken])

  useEffect(() => {
    if (!accessToken) disconnectSocket()
  }, [accessToken])

  // Присутствие по видимости вкладки: при сворачивании приложения сообщаем
  // серверу «away» (пользователь перестаёт «висеть в сети»), при возврате —
  // «active». Также пере-отправляем актуальное состояние после reconnect.
  useEffect(() => {
    if (!accessToken) return
    const socket = socketRef.current
    if (!socket) return

    const syncPresence = () => {
      if (!socket.connected) return
      socket.emit(document.hidden ? 'set_away' : 'set_active')
    }
    const onPageHide = () => { if (socket.connected) socket.emit('set_away') }

    document.addEventListener('visibilitychange', syncPresence)
    window.addEventListener('pagehide', onPageHide)
    socket.on('connect', syncPresence)
    // Отправляем текущее состояние сразу.
    syncPresence()

    return () => {
      document.removeEventListener('visibilitychange', syncPresence)
      window.removeEventListener('pagehide', onPageHide)
      socket.off('connect', syncPresence)
    }
  }, [accessToken])

  return socketRef.current
}

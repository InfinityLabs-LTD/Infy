import { Message } from '@/store/chat'
import { useAuthStore } from '@/store/auth'
import { ImageMessage } from './ImageMessage'
import { VideoMessage } from './VideoMessage'
import { AudioMessage } from './AudioMessage'
import { CircleVideoMessage } from './CircleVideoMessage'

interface Props {
  message: Message
  showSenderName?: boolean
}

export function MessageBubble({ message, showSenderName }: Props) {
  const myId = useAuthStore((s) => s.user?.id)
  const isOwn = message.sender.id === myId

  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  const att = message.attachments?.[0]
  const isMediaOnly = !message.content && att
  const isCircle = message.type === 'CIRCLE_VIDEO'

  if (isCircle && att) {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1 msg-appear`}>
        <div className="flex flex-col items-end gap-0.5">
          <CircleVideoMessage
            url={mediaUrl(att.publicUrl, att.storageKey)}
            thumbnailUrl={att.thumbnailKey ? mediaUrl(null, att.thumbnailKey) : null}
            durationMs={att.durationMs}
          />
          <span className="text-[11px] text-gray-400 px-1">{time}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1 msg-appear`}>
      <div className={`
        max-w-[78%] rounded-2xl text-sm overflow-hidden
        ${isMediaOnly ? '' : 'px-3.5 py-2.5'}
        ${isOwn ? 'bubble-own rounded-br-sm' : 'bubble-other rounded-bl-sm'}
      `}>
        {showSenderName && !isOwn && (
          <p className="text-xs font-semibold text-primary-500 mb-0.5 px-3.5 pt-2">
            {message.sender.nickname}
          </p>
        )}

        {att && (
          <div className={isMediaOnly ? '' : 'mb-2'}>
            {message.type === 'IMAGE' && (
              <ImageMessage
                url={mediaUrl(att.publicUrl, att.storageKey)}
                width={att.width}
                height={att.height}
              />
            )}
            {message.type === 'VIDEO' && (
              <VideoMessage
                url={mediaUrl(att.publicUrl, att.storageKey)}
                thumbnailUrl={att.thumbnailKey ? mediaUrl(null, att.thumbnailKey) : null}
                durationMs={att.durationMs}
              />
            )}
            {message.type === 'AUDIO' && (
              <div className="px-3.5 py-2">
                <AudioMessage
                  url={mediaUrl(att.publicUrl, att.storageKey)}
                  durationMs={att.durationMs}
                  waveform={att.waveform as number[] | null}
                  isOwn={isOwn}
                />
              </div>
            )}
          </div>
        )}

        {message.content && (
          <p className={`whitespace-pre-wrap break-words leading-relaxed ${isMediaOnly ? 'px-3.5 pb-2' : ''}`}>
            {message.content}
          </p>
        )}

        <div className={`flex items-center justify-end gap-1 mt-0.5 ${isMediaOnly ? 'px-3.5 pb-2' : ''} ${
          isOwn ? 'text-white/55' : 'text-gray-400'
        }`}>
          {message.editedAt && <span className="text-[10px] italic">изм.</span>}
          <span className="text-[11px]">{time}</span>
        </div>
      </div>
    </div>
  )
}

function mediaUrl(publicUrl: string | null | undefined, storageKey: string): string {
  // Skip internal Docker URLs (minio:9000, localhost:9000)
  if (publicUrl && !publicUrl.includes('minio:') && !publicUrl.includes('localhost:9000')) {
    if (publicUrl.startsWith('/')) return withToken(publicUrl)
    return publicUrl  // presigned or external URL
  }
  const apiUrl = import.meta.env.VITE_API_URL ?? '/api'
  const encoded = btoa(storageKey).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  return withToken(`${apiUrl}/media/${encoded}`)
}

function withToken(url: string): string {
  const token = useAuthStore.getState().accessToken
  if (!token) return url
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
}

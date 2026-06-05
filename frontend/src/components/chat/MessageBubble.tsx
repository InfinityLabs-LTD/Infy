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

  // Circle videos get their own bubble without the usual card shape
  if (isCircle && att) {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1`}>
        <div className="flex flex-col items-end gap-0.5">
          <CircleVideoMessage
            url={att.publicUrl ?? buildMediaUrl(att.storageKey)}
            thumbnailUrl={att.thumbnailKey ? buildMediaUrl(att.thumbnailKey) : null}
            durationMs={att.durationMs}
          />
          <span className="text-xs text-gray-400 px-1">{time}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1`}>
      <div
        className={`
          max-w-[75%] rounded-2xl text-sm overflow-hidden
          ${isMediaOnly ? '' : 'px-3.5 py-2'}
          ${isOwn
            ? 'bg-primary-600 text-white rounded-br-sm'
            : 'bg-white text-gray-900 shadow-sm border border-gray-100 rounded-bl-sm'}
        `}
      >
        {showSenderName && !isOwn && (
          <p className="text-xs font-semibold text-primary-600 mb-0.5 px-3.5 pt-2">
            {message.sender.nickname}
          </p>
        )}

        {/* Attachment */}
        {att && (
          <div className={isMediaOnly ? '' : 'mb-2'}>
            {message.type === 'IMAGE' && (
              <ImageMessage
                url={att.publicUrl ?? buildMediaUrl(att.storageKey)}
                width={att.width}
                height={att.height}
              />
            )}
            {message.type === 'VIDEO' && (
              <VideoMessage
                url={att.publicUrl ?? buildMediaUrl(att.storageKey)}
                thumbnailUrl={att.thumbnailKey ? buildMediaUrl(att.thumbnailKey) : null}
                durationMs={att.durationMs}
              />
            )}
            {message.type === 'AUDIO' && (
              <div className="px-3.5 py-2">
                <AudioMessage
                  url={att.publicUrl ?? buildMediaUrl(att.storageKey)}
                  durationMs={att.durationMs}
                  waveform={att.waveform as number[] | null}
                  isOwn={isOwn}
                />
              </div>
            )}
          </div>
        )}

        {/* Text content */}
        {message.content && (
          <p className={`whitespace-pre-wrap break-words leading-relaxed ${isMediaOnly ? 'px-3.5 pb-2' : ''}`}>
            {message.content}
          </p>
        )}

        {/* Timestamp */}
        <div className={`flex items-center justify-end gap-1 mt-0.5 ${isMediaOnly ? 'px-3.5 pb-2' : ''} ${isOwn ? 'text-white/70' : 'text-gray-400'}`}>
          {message.editedAt && <span className="text-xs">edited</span>}
          <span className="text-xs">{time}</span>
        </div>
      </div>
    </div>
  )
}

function buildMediaUrl(key: string): string {
  const apiUrl = import.meta.env.VITE_API_URL ?? '/api'
  const encoded = btoa(key).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  return `${apiUrl}/media/${encoded}`
}

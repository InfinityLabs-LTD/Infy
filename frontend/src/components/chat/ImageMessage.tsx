import { useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence } from 'framer-motion'
import { MessageAttachment } from '@/store/chat'
import { MediaLightbox, mediaUrl } from './MessageBubble'

interface Props {
  att: MessageAttachment
}

export function ImageMessage({ att }: Props) {
  const [open, setOpen] = useState(false)
  const url = mediaUrl(att.publicUrl, att.storageKey)
  const thumb = att.thumbnailKey ? mediaUrl(null, att.thumbnailKey) : url

  const aspect = att.width && att.height ? att.width / att.height : 1
  const displayW = 240
  const displayH = Math.round(displayW / aspect)

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        className="block rounded-xl overflow-hidden hover:opacity-90 transition-opacity"
        style={{ width: displayW, height: Math.min(displayH, 320) }}
      >
        <img
          src={thumb}
          alt="Image"
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </button>

      {/* Открываем фото тем же лайтбоксом, что и альбом — с крестиком и анимацией */}
      {createPortal(
        <AnimatePresence>
          {open && (
            <MediaLightbox items={[att]} index={0} onClose={() => setOpen(false)} onIndex={() => {}} />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}

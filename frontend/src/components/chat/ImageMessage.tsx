import { useState } from 'react'

interface Props {
  url: string
  width?: number | null
  height?: number | null
}

export function ImageMessage({ url, width, height }: Props) {
  const [open, setOpen] = useState(false)
  const aspect = width && height ? width / height : 1
  const displayW = Math.min(240, 240)
  const displayH = Math.round(displayW / aspect)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="block rounded-xl overflow-hidden hover:opacity-90 transition-opacity"
        style={{ width: displayW, height: Math.min(displayH, 320) }}
      >
        <img
          src={url}
          alt="Image"
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </button>

      {/* Lightbox — почти на весь экран, с панелью и крестиком */}
      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/95 flex flex-col"
          onClick={() => setOpen(false)}
        >
          <div className="flex items-center justify-end px-4 py-3 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setOpen(false)}
              title="Закрыть"
              className="w-10 h-10 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center px-2 pb-4 min-h-0">
            <img
              src={url}
              alt="Image"
              className="max-w-full max-h-full rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </>
  )
}

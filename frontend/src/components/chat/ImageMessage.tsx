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

      {/* Lightbox */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <img
            src={url}
            alt="Image"
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setOpen(false)}
            className="absolute top-4 right-4 text-white/70 hover:text-white"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}
    </>
  )
}

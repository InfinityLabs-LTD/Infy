import { useState } from 'react'
import { NewChatModal } from '@/components/chat/NewChatModal'

export function ChatListPage() {
  const [showNewChat, setShowNewChat] = useState(false)

  return (
    <div className="flex-1 flex flex-col items-center justify-center chat-bg select-none">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(168,85,247,0.25)' }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="1.5">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
      </div>
      <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text-mid)' }}>Выберите чат</h3>
      <p className="text-sm text-center max-w-[220px] leading-snug mb-4" style={{ color: 'var(--text-low)' }}>
        Откройте диалог из списка, начните новый или нажмите{' '}
        <kbd className="px-1.5 py-0.5 rounded-md text-xs font-mono"
          style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-stroke)', color: 'var(--text-mid)' }}>
          ⌘K
        </kbd>
      </p>
      <button onClick={() => setShowNewChat(true)} className="btn-primary text-sm px-5 py-2">
        Новый чат
      </button>
      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} />}
    </div>
  )
}

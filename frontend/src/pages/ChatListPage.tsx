import { useState } from 'react'
import { NewChatModal } from '@/components/chat/NewChatModal'

export function ChatListPage() {
  const [showNewChat, setShowNewChat] = useState(false)

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[#faf9ff] select-none">
      <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center mb-4">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.5">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
      </div>
      <h3 className="text-base font-semibold text-gray-600 mb-1">Выберите чат</h3>
      <p className="text-sm text-gray-400 text-center max-w-[200px] leading-snug mb-4">
        Откройте диалог из списка или начните новый
      </p>
      <button onClick={() => setShowNewChat(true)}
        className="btn-primary text-sm px-5 py-2">
        Новый чат
      </button>
      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} />}
    </div>
  )
}

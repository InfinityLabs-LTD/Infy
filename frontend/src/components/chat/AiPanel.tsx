import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { aiApi } from '@/api/ai'
import { Spinner } from '@/components/ui/Spinner'

interface Props {
  chatId: string
  onClose: () => void
  onUseReply: (text: string) => void
}

type Tab = 'summary' | 'replies'

// Infy Pulse — AI-помощник по чату: сводка диалога и умные ответы.
export function AiPanel({ chatId, onClose, onUseReply }: Props) {
  const [tab, setTab] = useState<Tab>('summary')

  const [summary, setSummary] = useState<string | null>(null)
  const [summaryCount, setSummaryCount] = useState(0)
  const [summaryLoading, setSummaryLoading] = useState(false)

  const [replies, setReplies] = useState<string[] | null>(null)
  const [repliesLoading, setRepliesLoading] = useState(false)

  const [error, setError] = useState<string | null>(null)

  function describeError(e: unknown): string {
    const err = e as { response?: { status?: number; data?: { error?: { code?: string; message?: string } } } }
    if (err.response?.status === 503) return 'AI-функции не настроены на сервере'
    return err.response?.data?.error?.message ?? 'Не удалось получить ответ AI'
  }

  async function loadSummary() {
    setSummaryLoading(true); setError(null)
    try {
      const r = await aiApi.summary(chatId)
      setSummary(r.data.data.summary)
      setSummaryCount(r.data.data.messageCount)
    } catch (e) { setError(describeError(e)) }
    finally { setSummaryLoading(false) }
  }

  async function loadReplies() {
    setRepliesLoading(true); setError(null)
    try {
      const r = await aiApi.replies(chatId)
      setReplies(r.data.data.replies)
    } catch (e) { setError(describeError(e)) }
    finally { setRepliesLoading(false) }
  }

  // Загружаем содержимое активной вкладки один раз
  useEffect(() => {
    if (tab === 'summary' && summary === null && !summaryLoading) loadSummary()
    if (tab === 'replies' && replies === null && !repliesLoading) loadReplies()
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="fixed inset-0 z-20" style={{ background: 'rgba(8,11,22,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <motion.div
        initial={{ x: 360 }}
        animate={{ x: 0 }}
        exit={{ x: 360 }}
        transition={{ type: 'spring', stiffness: 300, damping: 32 }}
        className="fixed right-0 top-0 bottom-0 z-30 flex flex-col w-80 max-w-full overflow-hidden"
        style={{
          background: 'rgba(13,17,35,0.85)',
          backdropFilter: 'blur(40px) saturate(150%)',
          WebkitBackdropFilter: 'blur(40px) saturate(150%)',
          borderLeft: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {/* Шапка */}
        <div className="shrink-0 flex items-center gap-2.5 px-3 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--grad-own)', boxShadow: 'var(--glow-primary)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-sm font-bold text-white leading-tight">Infy Pulse</p>
            <p className="text-[11px]" style={{ color: 'var(--text-low)' }}>AI-помощник чата</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-white/10 shrink-0"
            style={{ color: 'rgba(255,255,255,0.5)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Табы */}
        <div className="flex gap-1 px-3 pt-3 shrink-0">
          {([['summary', 'Сводка'], ['replies', 'Ответы']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className="px-3.5 py-1.5 rounded-xl text-sm font-medium transition-colors"
              style={{
                background: tab === t ? 'var(--glass-3)' : 'transparent',
                color: tab === t ? '#fff' : 'rgba(255,255,255,0.5)',
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Содержимое */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {error && (
            <div className="glass rounded-xl px-3 py-2.5 mb-3 text-xs" style={{ color: '#FCA5A5' }}>
              {error}
            </div>
          )}

          {tab === 'summary' ? (
            summaryLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Spinner size={22} />
                <p className="text-xs" style={{ color: 'var(--text-low)' }}>Анализирую переписку…</p>
              </div>
            ) : summary !== null ? (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <div className="glass rounded-2xl p-4">
                  <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-mid)' }}>
                    {summary}
                  </p>
                </div>
                <div className="flex items-center justify-between mt-3 px-1">
                  <span className="text-[11px]" style={{ color: 'var(--text-low)' }}>
                    {summaryCount} сообщ. проанализировано
                  </span>
                  <button onClick={loadSummary} className="text-xs transition-colors hover:text-white" style={{ color: '#C084FC' }}>
                    Обновить
                  </button>
                </div>
              </motion.div>
            ) : null
          ) : (
            repliesLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Spinner size={22} />
                <p className="text-xs" style={{ color: 'var(--text-low)' }}>Подбираю варианты…</p>
              </div>
            ) : replies !== null ? (
              replies.length === 0 ? (
                <p className="text-sm text-center py-10" style={{ color: 'var(--text-low)' }}>
                  Недостаточно сообщений для подсказок
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] px-1 mb-1" style={{ color: 'var(--text-low)' }}>
                    Нажмите, чтобы вставить в поле ввода
                  </p>
                  {replies.map((r, i) => (
                    <motion.button
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      onClick={() => { onUseReply(r); onClose() }}
                      className="w-full text-left glass rounded-2xl px-3.5 py-3 text-[13px] leading-relaxed transition-colors hover:bg-white/[0.1]"
                      style={{ color: 'var(--text-mid)' }}
                    >
                      {r}
                    </motion.button>
                  ))}
                  <button onClick={loadReplies} className="w-full text-center text-xs py-2 transition-colors hover:text-white" style={{ color: '#C084FC' }}>
                    Другие варианты
                  </button>
                </div>
              )
            ) : null
          )}
        </div>
      </motion.div>
    </>
  )
}

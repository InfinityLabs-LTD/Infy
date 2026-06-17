import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { aiApi, AiConvoMessage, SummaryPeriod, SummaryRange } from '@/api/ai'
import { Spinner } from '@/components/ui/Spinner'

interface Props {
  chatId: string
  onClose: () => void
  onUseReply: (text: string) => void
}

type Tab = 'assistant' | 'summary' | 'replies'

// Infy Puls — AI-помощник по чату: приватный диалог (поиск/веб/планы/подсказки),
// сводка диалога и умные ответы. Вкладка «Ассистент» приватна — собеседник её не видит.
export function AiPanel({ chatId, onClose, onUseReply }: Props) {
  const [tab, setTab] = useState<Tab>('assistant')

  // ── Приватный диалог ──
  const [convo, setConvo] = useState<AiConvoMessage[] | null>(null)
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // ── Сводка / Ответы ──
  const [summary, setSummary] = useState<string | null>(null)
  const [summaryCount, setSummaryCount] = useState(0)
  const [summaryLoading, setSummaryLoading] = useState(false)
  // Выбор периода: пресет или произвольный диапазон. Анализ запускается кнопкой.
  const [summaryPeriod, setSummaryPeriod] = useState<SummaryPeriod | 'custom'>('all')
  const [customFrom, setCustomFrom] = useState('') // datetime-local: YYYY-MM-DDTHH:mm
  const [customTo, setCustomTo] = useState('')
  const [replies, setReplies] = useState<string[] | null>(null)
  const [repliesLoading, setRepliesLoading] = useState(false)

  const [error, setError] = useState<string | null>(null)

  function describeError(e: unknown): string {
    const err = e as { response?: { status?: number; data?: { error?: { message?: string } } } }
    if (err.response?.status === 503) return 'AI-функции не настроены на сервере'
    return err.response?.data?.error?.message ?? 'Не удалось получить ответ AI'
  }

  // ── Приватный диалог ──
  async function loadConvo() {
    try {
      const r = await aiApi.getConversation(chatId)
      setConvo(r.data.data.messages)
    } catch (e) { setError(describeError(e)) }
  }

  async function send() {
    const text = input.trim()
    if (!text || thinking) return
    setInput(''); setError(null); setThinking(true)
    const optimistic: AiConvoMessage = {
      id: `tmp-${Date.now()}`, role: 'USER', content: text, createdAt: new Date().toISOString(),
    }
    setConvo(prev => [...(prev ?? []), optimistic])
    try {
      const r = await aiApi.sendToAssistant(chatId, text)
      const reply: AiConvoMessage = {
        id: `a-${Date.now()}`, role: 'ASSISTANT', content: r.data.data.reply,
        meta: { toolsUsed: r.data.data.toolsUsed, usedWebSearch: r.data.data.usedWebSearch },
        createdAt: new Date().toISOString(),
      }
      setConvo(prev => [...(prev ?? []), reply])
    } catch (e) {
      setError(describeError(e))
      setConvo(prev => (prev ?? []).filter(m => m.id !== optimistic.id))
      setInput(text)
    } finally { setThinking(false) }
  }

  async function clearConvo() {
    try { await aiApi.clearConversation(chatId); setConvo([]) } catch (e) { setError(describeError(e)) }
  }

  // ── Сводка / Ответы ──
  // Запуск анализа по кнопке. Берёт текущий выбор периода (пресет или свой диапазон).
  async function runSummary() {
    let range: SummaryRange
    if (summaryPeriod === 'custom') {
      if (!customFrom && !customTo) { setError('Укажите начало или конец периода'); return }
      const from = customFrom ? new Date(customFrom).toISOString() : undefined
      const to = customTo ? new Date(customTo).toISOString() : undefined
      if (from && to && new Date(from) > new Date(to)) { setError('Начало периода позже конца'); return }
      range = { from, to }
    } else {
      range = { period: summaryPeriod }
    }
    setSummaryLoading(true); setError(null)
    try {
      const r = await aiApi.summary(chatId, range)
      setSummary(r.data.data.summary); setSummaryCount(r.data.data.messageCount)
    } catch (e) { setError(describeError(e)) } finally { setSummaryLoading(false) }
  }
  async function loadReplies() {
    setRepliesLoading(true); setError(null)
    try {
      const r = await aiApi.replies(chatId)
      setReplies(r.data.data.replies)
    } catch (e) { setError(describeError(e)) } finally { setRepliesLoading(false) }
  }

  // Ленивая загрузка содержимого активной вкладки.
  // Сводка НЕ загружается автоматически — пользователь выбирает период и жмёт кнопку.
  useEffect(() => {
    if (tab === 'assistant' && convo === null) loadConvo()
    if (tab === 'replies' && replies === null && !repliesLoading) loadReplies()
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Автопрокрутка диалога вниз.
  useEffect(() => {
    if (tab === 'assistant') scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [convo, thinking, tab])

  function toolBadge(meta?: AiConvoMessage['meta']): string | null {
    if (!meta) return null
    const used: string[] = []
    if (meta.usedWebSearch) used.push('🌐 веб-поиск')
    if (meta.toolsUsed?.includes('search_chat')) used.push('🔍 по чату')
    if (meta.toolsUsed?.includes('create_reminder')) used.push('📅 напоминание')
    return used.length ? used.join(' · ') : null
  }

  return (
    <>
      <div className="fixed inset-0 z-20" style={{ background: 'rgba(8,11,22,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <motion.div
        initial={{ x: 380 }} animate={{ x: 0 }} exit={{ x: 380 }}
        transition={{ type: 'spring', stiffness: 300, damping: 32 }}
        className="fixed right-0 top-0 bottom-0 z-30 flex flex-col w-96 max-w-full overflow-hidden"
        style={{
          background: 'rgba(13,17,35,0.85)',
          backdropFilter: 'blur(40px) saturate(150%)',
          WebkitBackdropFilter: 'blur(40px) saturate(150%)',
          borderLeft: '1px solid rgba(255,255,255,0.07)',
        }}>
        {/* Шапка */}
        <div className="shrink-0 flex items-center gap-2.5 px-3 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--grad-own)', boxShadow: 'var(--glow-primary)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-sm font-bold text-white leading-tight">Infy Puls</p>
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
          {([['assistant', 'Ассистент'], ['summary', 'Сводка'], ['replies', 'Ответы']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className="px-3 py-1.5 rounded-xl text-[13px] font-medium transition-colors"
              style={{ background: tab === t ? 'var(--glass-3)' : 'transparent', color: tab === t ? '#fff' : 'rgba(255,255,255,0.5)' }}>
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mx-3 mt-3 glass rounded-xl px-3 py-2.5 text-xs shrink-0" style={{ color: '#FCA5A5' }}>{error}</div>
        )}

        {/* ── Вкладка: Ассистент (приватный диалог) ── */}
        {tab === 'assistant' && (
          <>
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
              {convo === null ? (
                <div className="flex justify-center py-10"><Spinner size={22} /></div>
              ) : convo.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <p className="text-sm" style={{ color: 'var(--text-mid)' }}>Спросите что угодно</p>
                  <p className="text-[11px] mt-2 leading-relaxed" style={{ color: 'var(--text-low)' }}>
                    Найду по переписке, поищу в интернете, помогу с ответом или запланирую напоминание.
                    Этот диалог виден только вам.
                  </p>
                </div>
              ) : (
                convo.map(m => {
                  const own = m.role === 'USER'
                  const badge = !own ? toolBadge(m.meta) : null
                  return (
                    <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[85%]">
                        <div className="rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap"
                          style={own
                            ? { background: 'var(--grad-own)', color: '#fff' }
                            : { background: 'var(--glass-3)', color: 'var(--text-mid)' }}>
                          {m.content}
                        </div>
                        {badge && <p className="text-[10px] mt-1 px-1" style={{ color: 'var(--text-low)' }}>{badge}</p>}
                        {!own && (
                          <button onClick={() => { onUseReply(m.content); onClose() }}
                            className="text-[10px] mt-1 px-1 transition-colors hover:text-white" style={{ color: '#C084FC' }}>
                            Вставить в поле ввода
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )
                })
              )}
              {thinking && (
                <div className="flex justify-start">
                  <div className="rounded-2xl px-3.5 py-2.5" style={{ background: 'var(--glass-3)' }}>
                    <Spinner size={16} />
                  </div>
                </div>
              )}
            </div>

            {/* Поле ввода */}
            <div className="shrink-0 p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              {convo && convo.length > 0 && (
                <button onClick={clearConvo} className="text-[11px] mb-2 transition-colors hover:text-white" style={{ color: 'var(--text-low)' }}>
                  Очистить диалог
                </button>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                  placeholder="Сообщение для Infy Puls…"
                  rows={1}
                  className="flex-1 resize-none px-3 py-2.5 rounded-xl text-sm text-white outline-none max-h-32"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} />
                <button onClick={send} disabled={!input.trim() || thinking}
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-opacity disabled:opacity-40"
                  style={{ background: 'var(--grad-own)', boxShadow: 'var(--glow-primary)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Вкладка: Сводка ── */}
        {tab === 'summary' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            {/* Выбор периода сводки (анализ запускается кнопкой ниже) */}
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {([
                ['hour', 'Час'], ['day', 'День'], ['week', 'Неделя'],
                ['month', 'Месяц'], ['year', 'Год'], ['all', 'Весь чат'], ['custom', 'Свой период'],
              ] as [SummaryPeriod | 'custom', string][]).map(([p, label]) => (
                <button key={p} onClick={() => setSummaryPeriod(p)} disabled={summaryLoading}
                  className="px-3 py-1 rounded-full text-[12px] font-medium transition-colors disabled:opacity-50"
                  style={{
                    background: summaryPeriod === p ? 'var(--grad-own)' : 'var(--glass-3)',
                    color: summaryPeriod === p ? '#fff' : 'rgba(255,255,255,0.6)',
                    boxShadow: summaryPeriod === p ? 'var(--glow-primary)' : 'none',
                  }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Поля произвольного диапазона (дата + время от/до) */}
            {summaryPeriod === 'custom' && (
              <div className="glass rounded-2xl p-3 mb-2.5 space-y-2.5">
                <label className="block">
                  <span className="text-[11px]" style={{ color: 'var(--text-low)' }}>С</span>
                  <input type="datetime-local" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                    disabled={summaryLoading}
                    className="mt-1 w-full px-2.5 py-1.5 rounded-lg text-[13px] text-white outline-none disabled:opacity-50"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', colorScheme: 'dark' }} />
                </label>
                <label className="block">
                  <span className="text-[11px]" style={{ color: 'var(--text-low)' }}>По</span>
                  <input type="datetime-local" value={customTo} onChange={e => setCustomTo(e.target.value)}
                    disabled={summaryLoading}
                    className="mt-1 w-full px-2.5 py-1.5 rounded-lg text-[13px] text-white outline-none disabled:opacity-50"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', colorScheme: 'dark' }} />
                </label>
                <p className="text-[10px]" style={{ color: 'var(--text-low)' }}>Можно указать только одну границу.</p>
              </div>
            )}

            {/* Кнопка запуска анализа */}
            <button onClick={runSummary} disabled={summaryLoading}
              className="w-full py-2.5 rounded-xl text-[13px] font-semibold text-white transition-opacity disabled:opacity-50 mb-3"
              style={{ background: 'var(--grad-own)', boxShadow: 'var(--glow-primary)' }}>
              {summary === null ? 'Проанализировать' : 'Проанализировать заново'}
            </button>

            {summaryLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Spinner size={22} /><p className="text-xs" style={{ color: 'var(--text-low)' }}>Анализирую переписку…</p>
              </div>
            ) : summary !== null ? (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <div className="glass rounded-2xl p-4">
                  <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-mid)' }}>{summary}</p>
                </div>
                <div className="mt-3 px-1">
                  <span className="text-[11px]" style={{ color: 'var(--text-low)' }}>{summaryCount} сообщ. проанализировано</span>
                </div>
              </motion.div>
            ) : (
              <p className="text-sm text-center py-10 px-4" style={{ color: 'var(--text-low)' }}>
                Выберите период и нажмите «Проанализировать».
              </p>
            )}
          </div>
        )}

        {/* ── Вкладка: Ответы ── */}
        {tab === 'replies' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            {repliesLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Spinner size={22} /><p className="text-xs" style={{ color: 'var(--text-low)' }}>Подбираю варианты…</p>
              </div>
            ) : replies !== null ? (
              replies.length === 0 ? (
                <p className="text-sm text-center py-10" style={{ color: 'var(--text-low)' }}>Недостаточно сообщений для подсказок</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] px-1 mb-1" style={{ color: 'var(--text-low)' }}>Нажмите, чтобы вставить в поле ввода</p>
                  {replies.map((r, i) => (
                    <motion.button key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                      onClick={() => { onUseReply(r); onClose() }}
                      className="w-full text-left glass rounded-2xl px-3.5 py-3 text-[13px] leading-relaxed transition-colors hover:bg-white/[0.1]"
                      style={{ color: 'var(--text-mid)' }}>
                      {r}
                    </motion.button>
                  ))}
                  <button onClick={loadReplies} className="w-full text-center text-xs py-2 transition-colors hover:text-white" style={{ color: '#C084FC' }}>Другие варианты</button>
                </div>
              )
            ) : null}
          </div>
        )}
      </motion.div>
    </>
  )
}

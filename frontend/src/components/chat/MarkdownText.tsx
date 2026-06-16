import React from 'react'

// Минимальный безопасный рендер markdown для AI-сообщений.
// Поддержка: **жирный**, *курсив*/_курсив_, `код`, ссылки [t](url) и «голые» URL,
// маркированные списки (- / • / *) и переносы строк. Без HTML-инъекций — мы
// строим только React-узлы из распознанных токенов, исходный текст не вставляем как HTML.

type Node = React.ReactNode

// Инлайновое форматирование внутри одной строки.
function renderInline(text: string, keyBase: string): Node[] {
  const nodes: Node[] = []
  let rest = text
  let i = 0

  // Порядок важен: код → жирный → курсив → ссылки → URL.
  const patterns: { re: RegExp; render: (m: RegExpMatchArray, key: string) => Node }[] = [
    { re: /`([^`]+)`/, render: (m, k) => (
        <code key={k} className="px-1 py-0.5 rounded text-[0.85em]" style={{ background: 'rgba(255,255,255,0.12)', fontFamily: 'ui-monospace, monospace' }}>{m[1]}</code>
      ) },
    { re: /\*\*([^*]+)\*\*/, render: (m, k) => <strong key={k}>{m[1]}</strong> },
    { re: /__([^_]+)__/, render: (m, k) => <strong key={k}>{m[1]}</strong> },
    { re: /\*([^*]+)\*/, render: (m, k) => <em key={k}>{m[1]}</em> },
    { re: /_([^_]+)_/, render: (m, k) => <em key={k}>{m[1]}</em> },
    { re: /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/, render: (m, k) => (
        <a key={k} href={m[2]} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: '#C084FC' }}>{m[1]}</a>
      ) },
    { re: /(https?:\/\/[^\s]+)/, render: (m, k) => (
        <a key={k} href={m[1]} target="_blank" rel="noopener noreferrer" className="underline break-all" style={{ color: '#C084FC' }}>{m[1]}</a>
      ) },
  ]

  // Жадно ищем ближайшее совпадение любого паттерна и режем строку.
  while (rest.length > 0) {
    let best: { idx: number; len: number; node: Node } | null = null
    for (const p of patterns) {
      const m = rest.match(p.re)
      if (m && m.index !== undefined) {
        if (!best || m.index < best.idx) {
          best = { idx: m.index, len: m[0].length, node: p.render(m, `${keyBase}-${i++}`) }
        }
      }
    }
    if (!best) { nodes.push(rest); break }
    if (best.idx > 0) nodes.push(rest.slice(0, best.idx))
    nodes.push(best.node)
    rest = rest.slice(best.idx + best.len)
  }
  return nodes
}

export function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n')
  const blocks: Node[] = []
  let listItems: Node[] = []
  let key = 0

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push(
        <ul key={`ul-${key++}`} className="list-disc pl-5 my-1 space-y-0.5">{listItems}</ul>
      )
      listItems = []
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    const liMatch = trimmed.match(/^[-•*]\s+(.*)$/)
    if (liMatch) {
      listItems.push(<li key={`li-${key++}`}>{renderInline(liMatch[1], `li-${key}`)}</li>)
      continue
    }
    flushList()
    if (trimmed === '') {
      blocks.push(<div key={`sp-${key++}`} className="h-2" />)
    } else {
      blocks.push(<p key={`p-${key++}`}>{renderInline(line, `p-${key}`)}</p>)
    }
  }
  flushList()

  return <div className="leading-relaxed break-words space-y-0.5">{blocks}</div>
}

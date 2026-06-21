import { env } from './env.js'

const BASE = env.DOCKER_PROXY_URL

// M-6 / C-1: container id строго валидируется и URL-кодируется перед
// подстановкой в путь Docker API, чтобы исключить path/param-инъекцию
// (например `<id>/kill?...`) через proxy, разрешающий любые POST.
const CONTAINER_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/

function safeContainerId(id: string): string {
  if (!CONTAINER_ID_RE.test(id)) {
    throw new Error(`Invalid container id: ${id}`)
  }
  return encodeURIComponent(id)
}

async function dockerFetch(path: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Docker API ${path} → ${res.status}: ${text}`)
  }
  return res
}

export interface ContainerInfo {
  id: string
  names: string[]
  image: string
  status: string
  state: string
  created: number
}

export async function listContainers(): Promise<ContainerInfo[]> {
  const res = await dockerFetch('/containers/json?all=1')
  const raw: Array<{
    Id: string
    Names: string[]
    Image: string
    Status: string
    State: string
    Created: number
  }> = await res.json()

  return raw.map(c => ({
    id: c.Id,
    names: c.Names.map(n => n.replace(/^\//, '')),
    image: c.Image,
    status: c.Status,
    state: c.State,
    created: c.Created,
  }))
}

export async function restartContainer(id: string): Promise<void> {
  await dockerFetch(`/containers/${safeContainerId(id)}/restart`, { method: 'POST' })
}

export async function* streamLogs(
  id: string,
  tail = 200,
): AsyncGenerator<string> {
  const safeTail = Number.isInteger(tail) && tail > 0 && tail <= 5000 ? tail : 200
  const res = await fetch(
    `${BASE}/containers/${safeContainerId(id)}/logs?stdout=1&stderr=1&follow=1&tail=${safeTail}&timestamps=1`,
  )
  if (!res.ok || !res.body) {
    throw new Error(`Log stream failed: ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    // Docker log stream: 8-byte header per frame (stream type + size), then payload
    // We strip headers by looking for printable content after first 8 bytes per chunk
    buf += decoder.decode(value, { stream: true })

    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      // Strip binary header (first 8 chars if non-printable)
      const clean = line.replace(/^[\x00-\x07].{7}/, '')
      if (clean.trim()) yield clean
    }
  }
  if (buf.trim()) yield buf.replace(/^[\x00-\x07].{7}/, '')
}

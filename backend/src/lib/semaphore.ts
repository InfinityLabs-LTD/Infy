/**
 * Простой счётный семафор для ограничения параллелизма тяжёлых задач
 * (H-4: транскодинг ffmpeg). Без него N одновременных загрузок видео порождают
 * N конкурирующих ffmpeg-процессов и насыщают CPU. Семафор сериализует их до
 * заданного предела, остальные ждут в очереди.
 */
export class Semaphore {
  private permits: number
  private queue: Array<() => void> = []

  constructor(permits: number) {
    this.permits = Math.max(1, permits)
  }

  private async acquire(): Promise<void> {
    if (this.permits > 0) { this.permits -= 1; return }
    await new Promise<void>(resolve => this.queue.push(resolve))
  }

  private release(): void {
    const next = this.queue.shift()
    if (next) next()
    else this.permits += 1
  }

  /** Выполняет fn, удерживая один слот семафора, и гарантированно освобождает его. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }
}

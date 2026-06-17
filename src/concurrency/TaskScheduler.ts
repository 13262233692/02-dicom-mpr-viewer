export interface SyncBarrierOptions {
  threshold?: number
  timeoutMs?: number
}

export class SyncBarrier {
  private count: number
  private threshold: number
  private timeoutMs: number
  private waiters: Array<() => void> = []

  constructor(options: SyncBarrierOptions = {}) {
    this.threshold = options.threshold ?? 2
    this.timeoutMs = options.timeoutMs ?? 5000
    this.count = 0
  }

  arrive(): Promise<void> {
    this.count++

    if (this.count >= this.threshold) {
      const waiters = this.waiters
      this.waiters = []
      this.count = 0
      waiters.forEach(resolve => resolve())
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const idx = this.waiters.indexOf(resolve)
        if (idx !== -1) {
          this.waiters.splice(idx, 1)
          reject(new Error('SyncBarrier 等待超时'))
        }
      }, this.timeoutMs)

      this.waiters.push(() => {
        clearTimeout(timeout)
        resolve()
      })
    })
  }

  reset(): void {
    this.count = 0
    this.waiters.forEach(resolve => resolve())
    this.waiters = []
  }
}

export const TASK_PRIORITY_LOW = 0
export const TASK_PRIORITY_NORMAL = 1
export const TASK_PRIORITY_HIGH = 2
export const TASK_PRIORITY_CRITICAL = 3

export interface TaskQueueItem<T = any> {
  id: number
  priority: number
  task: () => Promise<T> | T
  resolve: (value: T) => void
  reject: (reason: any) => void
  timestamp: number
}

export class TaskScheduler {
  private queue: TaskQueueItem[] = []
  private isProcessing: boolean = false
  private taskIdCounter: number = 0
  private maxConcurrent: number
  private currentRunning: number = 0

  constructor(maxConcurrent: number = 1) {
    this.maxConcurrent = maxConcurrent
  }

  schedule<T>(
    task: () => Promise<T> | T,
    priority: number = TASK_PRIORITY_NORMAL
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const item: TaskQueueItem<T> = {
        id: ++this.taskIdCounter,
        priority,
        task,
        resolve: resolve as (value: any) => void,
        reject: reject as (reason: any) => void,
        timestamp: Date.now()
      }

      this.queue.push(item)
      this.sortQueue()
      this.processQueue()
    })
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority
      }
      return a.timestamp - b.timestamp
    })
  }

  private processQueue(): void {
    if (this.isProcessing || this.currentRunning >= this.maxConcurrent) {
      return
    }

    if (this.queue.length === 0) {
      return
    }

    this.isProcessing = true

    while (this.queue.length > 0 && this.currentRunning < this.maxConcurrent) {
      const item = this.queue.shift()!
      this.currentRunning++

      this.executeTask(item)
        .finally(() => {
          this.currentRunning--

          if (this.queue.length > 0) {
            setTimeout(() => this.processQueue(), 0)
          } else {
            this.isProcessing = false
          }
        })
    }
  }

  private async executeTask<T>(item: TaskQueueItem<T>): Promise<void> {
    try {
      const result = await item.task()
      item.resolve(result)
    } catch (error) {
      item.reject(error)
    }
  }

  clear(): void {
    this.queue.forEach(item => {
      item.reject(new Error('TaskQueue 已被清空'))
    })
    this.queue = []
  }

  get pendingCount(): number {
    return this.queue.length + this.currentRunning
  }
}

export function debounceWithPriority<T extends (...args: any[]) => any>(
  fn: T,
  delay: number = 16,
  scheduler: TaskScheduler,
  priority: number = TASK_PRIORITY_HIGH
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  let lastTimer: number | null = null
  let lastArgs: Parameters<T> | null = null

  return (...args: Parameters<T>): Promise<ReturnType<T>> => {
    lastArgs = args

    if (lastTimer !== null) {
      clearTimeout(lastTimer)
    }

    return new Promise((resolve, reject) => {
      lastTimer = window.setTimeout(() => {
        scheduler.schedule(async () => {
          if (lastArgs) {
            return fn(...lastArgs) as ReturnType<T>
          }
        }, priority).then(resolve).catch(reject)
      }, delay)
    })
  }
}

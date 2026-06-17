import type { VolumeData, VolumeSpacing } from '@/types'
import { DoubleBufferManager } from '@/concurrency/DoubleBufferManager'
import { TaskScheduler, TASK_PRIORITY_HIGH, TASK_PRIORITY_CRITICAL } from '@/concurrency/TaskScheduler'
import { buildVolumeFromSlices } from '@/volume/VolumeBuilder'

type WorkerTaskType = 'build-volume' | 'apply-window-level'

interface PendingTask {
  id: string
  type: WorkerTaskType
  resolve: (value: any) => void
  reject: (reason: any) => void
}

export class VolumeWorkerManager {
  private worker: Worker | null = null
  private pendingTasks = new Map<string, PendingTask>()
  private taskScheduler: TaskScheduler
  private taskIdCounter = 0
  private doubleBuffer: DoubleBufferManager | null = null
  private voxelCount: number = 0

  private isProcessingWindowLevel: boolean = false
  private pendingWindowLevel: {
    windowWidth: number
    windowLevel: number
    sourceData: Uint16Array
    minValue: number
    maxValue: number
  } | null = null

  constructor() {
    this.taskScheduler = new TaskScheduler(1)
  }

  async init(): Promise<void> {
    if (this.worker) return

    try {
      const VolumeWorkerModule = await import('@/workers/volumeProcessor.worker?worker')
      this.worker = new VolumeWorkerModule.default()
      this.worker.onmessage = this.handleWorkerMessage.bind(this)
      this.worker.onerror = this.handleWorkerError.bind(this)
    } catch (e) {
      console.warn('Worker 初始化失败，将使用主线程处理:', e)
      this.worker = null
    }
  }

  setDoubleBuffer(doubleBuffer: DoubleBufferManager | null): void {
    this.doubleBuffer = doubleBuffer
  }

  setVoxelCount(count: number): void {
    this.voxelCount = count
  }

  async buildVolume(
    slices: Uint16Array[],
    width: number,
    height: number,
    depth: number,
    spacing: VolumeSpacing
  ): Promise<VolumeData> {
    if (!this.worker) {
      return this.fallbackBuildVolume(slices, width, height, depth, spacing)
    }

    return this.taskScheduler.schedule<VolumeData>(() => {
      return new Promise((resolve, reject) => {
        const id = this.generateTaskId()
        this.pendingTasks.set(id, { id, type: 'build-volume', resolve, reject })

        this.worker!.postMessage({
          type: 'build-volume',
          payload: { slices, width, height, depth, spacing },
          id
        }, { transfer: slices.map(s => s.buffer).filter(b => b instanceof ArrayBuffer) as Transferable[] })
      })
    }, TASK_PRIORITY_CRITICAL)
  }

  scheduleWindowLevelUpdate(
    windowWidth: number,
    windowLevel: number,
    sourceData: Uint16Array,
    minValue: number,
    maxValue: number
  ): void {
    this.pendingWindowLevel = { windowWidth, windowLevel, sourceData, minValue, maxValue }

    if (!this.isProcessingWindowLevel) {
      void this.processPendingWindowLevel()
    }
  }

  private async processPendingWindowLevel(): Promise<void> {
    if (!this.pendingWindowLevel) {
      this.isProcessingWindowLevel = false
      return
    }

    this.isProcessingWindowLevel = true
    const params = this.pendingWindowLevel
    this.pendingWindowLevel = null

    try {
      if (this.doubleBuffer) {
        this.doubleBuffer.applyWindowLevelToBackBuffer(
          params.sourceData,
          params.windowWidth,
          params.windowLevel,
          params.minValue,
          params.maxValue
        )
      }
    } catch (e) {
      console.error('窗宽窗位处理失败:', e)
    } finally {
      if (this.pendingWindowLevel) {
        setTimeout(() => this.processPendingWindowLevel(), 0)
      } else {
        this.isProcessingWindowLevel = false
      }
    }
  }

  async applyWindowLevel(
    sourceData: Uint16Array,
    windowWidth: number,
    windowLevel: number,
    minValue: number,
    maxValue: number
  ): Promise<Uint8Array> {
    if (!this.worker) {
      return this.fallbackApplyWindowLevel(sourceData, windowWidth, windowLevel, minValue, maxValue)
    }

    return this.taskScheduler.schedule<Uint8Array>(() => {
      return new Promise((resolve, reject) => {
        const id = this.generateTaskId()
        this.pendingTasks.set(id, { id, type: 'apply-window-level', resolve, reject })

        this.worker!.postMessage({
          type: 'apply-window-level',
          payload: { sourceData, windowWidth, windowLevel, minValue, maxValue },
          id
        }, { transfer: [sourceData.buffer] })
      })
    }, TASK_PRIORITY_HIGH)
  }

  private fallbackBuildVolume(
    slices: Uint16Array[],
    width: number,
    height: number,
    depth: number,
    spacing: VolumeSpacing
  ): VolumeData {
    return buildVolumeFromSlices(slices, width, height, spacing)
  }

  private fallbackApplyWindowLevel(
    sourceData: Uint16Array,
    windowWidth: number,
    windowLevel: number,
    minValue: number,
    maxValue: number
  ): Uint8Array {
    const lower = windowLevel - windowWidth * 0.5
    const upper = windowLevel + windowWidth * 0.5
    const range = upper - lower > 0 ? upper - lower : 1

    const result = new Uint8Array(sourceData.length)
    for (let i = 0; i < sourceData.length; i++) {
      const rawValue = sourceData[i]
      const normalized = Math.max(0, Math.min(1, (rawValue - lower) / range))
      result[i] = Math.floor(normalized * 255)
    }
    return result
  }

  private handleWorkerMessage(event: MessageEvent): void {
    const { type, payload, id } = event.data

    if (type === 'progress') {
      return
    }

    if (!id) return

    const task = this.pendingTasks.get(id)
    if (!task) return

    this.pendingTasks.delete(id)

    if (type === 'error') {
      task.reject(new Error(payload?.message || 'Worker 任务失败'))
    } else {
      task.resolve(payload)
    }
  }

  private handleWorkerError(event: ErrorEvent): void {
    console.error('Volume Worker 错误:', event)
    this.pendingTasks.forEach(task => {
      task.reject(new Error(event.message || 'Worker 异常'))
    })
    this.pendingTasks.clear()
  }

  private generateTaskId(): string {
    return `task-${++this.taskIdCounter}-${Date.now()}`
  }

  dispose(): void {
    this.taskScheduler.clear()
    this.pendingTasks.clear()

    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
  }
}

let workerManagerInstance: VolumeWorkerManager | null = null

export function getVolumeWorkerManager(): VolumeWorkerManager {
  if (!workerManagerInstance) {
    workerManagerInstance = new VolumeWorkerManager()
  }
  return workerManagerInstance
}

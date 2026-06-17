import { VolumeBuilder } from '@/volume/VolumeBuilder'
import type { VolumeData, VolumeSpacing } from '@/types'

export type WorkerMessageType =
  | 'build-volume'
  | 'apply-window-level'
  | 'update-slice'
  | 'volume-ready'
  | 'progress'
  | 'error'

export interface WorkerMessage {
  type: WorkerMessageType
  payload?: any
  id?: string
}

export interface BuildVolumePayload {
  slices: Uint16Array[]
  width: number
  height: number
  depth: number
  spacing: VolumeSpacing
  sharedBuffer?: SharedArrayBuffer
}

export interface ApplyWindowLevelPayload {
  sourceData: Uint16Array
  windowWidth: number
  windowLevel: number
  minValue: number
  maxValue: number
  sharedBuffer?: SharedArrayBuffer
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, payload, id } = event.data

  switch (type) {
    case 'build-volume':
      handleBuildVolume(payload as BuildVolumePayload, id)
      break
    case 'apply-window-level':
      handleApplyWindowLevel(payload as ApplyWindowLevelPayload, id)
      break
  }
}

function handleBuildVolume(payload: BuildVolumePayload, id?: string): void {
  try {
    const { slices, width, height, depth, spacing } = payload

    reportProgress(0.1, '初始化体积构建器...', id)

    const builder = new VolumeBuilder(width, height, depth)
    builder.setSpacing(spacing.x, spacing.y, spacing.z)

    const totalSlices = depth
    const reportInterval = Math.max(1, Math.floor(totalSlices / 20))

    for (let z = 0; z < depth; z++) {
      if (!slices[z]) continue

      builder.addSlice(z, slices[z], width * height)

      if (z % reportInterval === 0) {
        const progress = 0.1 + 0.6 * (z / totalSlices)
        reportProgress(progress, `正在处理切片 ${z + 1}/${totalSlices}...`, id)
      }
    }

    reportProgress(0.75, '构建三维体积数据...', id)
    builder.buildVolume()

    reportProgress(0.9, '生成归一化数据...', id)
    const volumeData = builder.getVolumeData()

    reportProgress(1.0, '体积构建完成', id)

    self.postMessage({
      type: 'volume-ready' as WorkerMessageType,
      payload: volumeData,
      id
    })
  } catch (error) {
    self.postMessage({
      type: 'error' as WorkerMessageType,
      payload: { message: error instanceof Error ? error.message : String(error) },
      id
    })
  }
}

function handleApplyWindowLevel(payload: ApplyWindowLevelPayload, id?: string): void {
  try {
    const { sourceData, windowWidth, windowLevel, minValue, maxValue } = payload

    reportProgress(0.0, '应用窗宽窗位...', id)

    const lower = windowLevel - windowWidth * 0.5
    const upper = windowLevel + windowWidth * 0.5
    const range = upper - lower > 0 ? upper - lower : 1

    const result = new Uint8Array(sourceData.length)
    const chunkSize = Math.floor(sourceData.length / 10)

    for (let i = 0; i < sourceData.length; i++) {
      const rawValue = sourceData[i]
      const normalized = Math.max(0, Math.min(1, (rawValue - lower) / range))
      result[i] = Math.floor(normalized * 255)

      if (chunkSize > 0 && i % chunkSize === 0) {
        reportProgress(i / sourceData.length, '处理中...', id)
      }
    }

    self.postMessage({
      type: 'volume-ready' as WorkerMessageType,
      payload: { windowLevelData: result },
      id
    }, { transfer: [result.buffer] })
  } catch (error) {
    self.postMessage({
      type: 'error' as WorkerMessageType,
      payload: { message: error instanceof Error ? error.message : String(error) },
      id
    })
  }
}

function reportProgress(progress: number, message: string, id?: string): void {
  self.postMessage({
    type: 'progress' as WorkerMessageType,
    payload: { progress, message },
    id
  })
}

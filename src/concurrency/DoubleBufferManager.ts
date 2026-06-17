export const LOCK_UNLOCKED = 0
export const LOCK_LOCKED = 1

export const BUFFER_FLAG_DIRTY = 0
export const BUFFER_FLAG_CLEAN = 1

export const ATOMIC_LOCK_OFFSET = 0
export const ATOMIC_FRONT_BUFFER_OFFSET = 1
export const ATOMIC_BACK_BUFFER_OFFSET = 2
export const ATOMIC_DATA_READY_OFFSET = 3
export const ATOMIC_FRAME_COUNTER_OFFSET = 4

export const ATOMIC_HEADER_SIZE = 8

export interface DoubleBufferLayout {
  totalBytes: number
  headerOffset: number
  bufferAOffset: number
  bufferBOffset: number
  bufferStride: number
}

export function calculateBufferLayout(
  voxelCount: number,
  bytesPerVoxel: number = 1
): DoubleBufferLayout {
  const headerBytes = ATOMIC_HEADER_SIZE * Int32Array.BYTES_PER_ELEMENT
  const singleBufferBytes = Math.ceil((voxelCount * bytesPerVoxel) / 4) * 4
  const totalBytes = headerBytes + singleBufferBytes * 2

  return {
    totalBytes,
    headerOffset: 0,
    bufferAOffset: headerBytes,
    bufferBOffset: headerBytes + singleBufferBytes,
    bufferStride: singleBufferBytes
  }
}

export class Spinlock {
  private atomicArray: Int32Array
  private lockOffset: number

  constructor(sharedBuffer: SharedArrayBuffer, lockOffset: number = 0) {
    this.atomicArray = new Int32Array(sharedBuffer)
    this.lockOffset = lockOffset
  }

  lock(): void {
    while (true) {
      const oldValue = Atomics.compareExchange(
        this.atomicArray,
        this.lockOffset,
        LOCK_UNLOCKED,
        LOCK_LOCKED
      )
      if (oldValue === LOCK_UNLOCKED) {
        return
      }
      Atomics.wait(this.atomicArray, this.lockOffset, LOCK_LOCKED, 1)
    }
  }

  tryLock(): boolean {
    const oldValue = Atomics.compareExchange(
      this.atomicArray,
      this.lockOffset,
      LOCK_UNLOCKED,
      LOCK_LOCKED
    )
    return oldValue === LOCK_UNLOCKED
  }

  unlock(): void {
    Atomics.store(this.atomicArray, this.lockOffset, LOCK_UNLOCKED)
    Atomics.notify(this.atomicArray, this.lockOffset, 1)
  }

  withLock<T>(callback: () => T): T {
    this.lock()
    try {
      return callback()
    } finally {
      this.unlock()
    }
  }
}

export class DoubleBufferManager {
  private sharedBuffer: SharedArrayBuffer
  private layout: DoubleBufferLayout
  private atomicArray: Int32Array
  private spinlock: Spinlock

  private bufferA: Uint8Array
  private bufferB: Uint8Array

  private bytesPerVoxel: number

  constructor(
    voxelCount: number,
    bytesPerVoxel: number = 1,
    existingBuffer?: SharedArrayBuffer
  ) {
    this.bytesPerVoxel = bytesPerVoxel
    this.layout = calculateBufferLayout(voxelCount, bytesPerVoxel)

    if (existingBuffer) {
      if (existingBuffer.byteLength < this.layout.totalBytes) {
        throw new Error(
          `SharedArrayBuffer 太小: 需要 ${this.layout.totalBytes} 字节，实际 ${existingBuffer.byteLength}`
        )
      }
      this.sharedBuffer = existingBuffer
    } else {
      if (typeof SharedArrayBuffer === 'undefined') {
        throw new Error('当前环境不支持 SharedArrayBuffer')
      }
      this.sharedBuffer = new SharedArrayBuffer(this.layout.totalBytes)
    }

    this.atomicArray = new Int32Array(
      this.sharedBuffer,
      this.layout.headerOffset,
      ATOMIC_HEADER_SIZE
    )
    this.spinlock = new Spinlock(this.sharedBuffer, ATOMIC_LOCK_OFFSET)

    this.bufferA = new Uint8Array(
      this.sharedBuffer,
      this.layout.bufferAOffset,
      this.layout.bufferStride
    )
    this.bufferB = new Uint8Array(
      this.sharedBuffer,
      this.layout.bufferBOffset,
      this.layout.bufferStride
    )

    this.initializeHeaders()
  }

  private initializeHeaders(): void {
    this.spinlock.withLock(() => {
      Atomics.store(this.atomicArray, ATOMIC_FRONT_BUFFER_OFFSET, 0)
      Atomics.store(this.atomicArray, ATOMIC_BACK_BUFFER_OFFSET, 1)
      Atomics.store(this.atomicArray, ATOMIC_DATA_READY_OFFSET, BUFFER_FLAG_DIRTY)
      Atomics.store(this.atomicArray, ATOMIC_FRAME_COUNTER_OFFSET, 0)
    })
  }

  getSharedBuffer(): SharedArrayBuffer {
    return this.sharedBuffer
  }

  getLayout(): DoubleBufferLayout {
    return this.layout
  }

  getBackBufferForWrite(): Uint8Array {
    this.spinlock.lock()
    const backBufferIndex = Atomics.load(this.atomicArray, ATOMIC_BACK_BUFFER_OFFSET)
    this.spinlock.unlock()

    return backBufferIndex === 0 ? this.bufferA : this.bufferB
  }

  getFrontBufferForRead(): Uint8Array | null {
    if (!this.spinlock.tryLock()) {
      return null
    }
    try {
      const frontBufferIndex = Atomics.load(this.atomicArray, ATOMIC_FRONT_BUFFER_OFFSET)
      const isReady = Atomics.load(this.atomicArray, ATOMIC_DATA_READY_OFFSET) === BUFFER_FLAG_CLEAN

      if (!isReady) {
        return null
      }

      const buffer = frontBufferIndex === 0 ? this.bufferA : this.bufferB
      return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    } finally {
      this.spinlock.unlock()
    }
  }

  getFrontBufferForReadBlocking(): Uint8Array {
    this.spinlock.lock()
    try {
      const frontBufferIndex = Atomics.load(this.atomicArray, ATOMIC_FRONT_BUFFER_OFFSET)
      const buffer = frontBufferIndex === 0 ? this.bufferA : this.bufferB
      return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    } finally {
      this.spinlock.unlock()
    }
  }

  commitBackBuffer(): void {
    this.spinlock.lock()
    try {
      const currentFront = Atomics.load(this.atomicArray, ATOMIC_FRONT_BUFFER_OFFSET)
      const currentBack = Atomics.load(this.atomicArray, ATOMIC_BACK_BUFFER_OFFSET)

      Atomics.store(this.atomicArray, ATOMIC_FRONT_BUFFER_OFFSET, currentBack)
      Atomics.store(this.atomicArray, ATOMIC_BACK_BUFFER_OFFSET, currentFront)
      Atomics.store(this.atomicArray, ATOMIC_DATA_READY_OFFSET, BUFFER_FLAG_CLEAN)

      const currentFrame = Atomics.load(this.atomicArray, ATOMIC_FRAME_COUNTER_OFFSET)
      Atomics.store(this.atomicArray, ATOMIC_FRAME_COUNTER_OFFSET, currentFrame + 1)
    } finally {
      this.spinlock.unlock()
    }
  }

  markFrontBufferDirty(): void {
    this.spinlock.withLock(() => {
      Atomics.store(this.atomicArray, ATOMIC_DATA_READY_OFFSET, BUFFER_FLAG_DIRTY)
    })
  }

  getDataReady(): boolean {
    return Atomics.load(this.atomicArray, ATOMIC_DATA_READY_OFFSET) === BUFFER_FLAG_CLEAN
  }

  getFrameCounter(): number {
    return Atomics.load(this.atomicArray, ATOMIC_FRAME_COUNTER_OFFSET)
  }

  waitForNewFrame(oldFrame: number, timeoutMs: number = 100): boolean {
    const result = Atomics.wait(
      this.atomicArray,
      ATOMIC_FRAME_COUNTER_OFFSET,
      oldFrame,
      timeoutMs
    )
    return result === 'ok'
  }

  writeToBackBuffer(data: Uint8Array | Uint16Array, normalizeTo8bit: boolean = false): void {
    const backBuffer = this.getBackBufferForWrite()

    if (normalizeTo8bit && data instanceof Uint16Array) {
      for (let i = 0; i < data.length && i < backBuffer.length; i++) {
        backBuffer[i] = Math.min(255, data[i] >> 4)
      }
    } else if (data instanceof Uint8Array) {
      backBuffer.set(data.subarray(0, backBuffer.length))
    } else {
      for (let i = 0; i < data.length && i < backBuffer.length; i++) {
        backBuffer[i] = Math.min(255, Math.max(0, data[i]))
      }
    }

    this.commitBackBuffer()
  }

  applyWindowLevelToBackBuffer(
    sourceData: Uint16Array,
    windowWidth: number,
    windowLevel: number,
    minValue: number,
    maxValue: number
  ): void {
    const backBuffer = this.getBackBufferForWrite()

    const lower = windowLevel - windowWidth * 0.5
    const upper = windowLevel + windowWidth * 0.5
    const range = upper - lower > 0 ? upper - lower : 1

    for (let i = 0; i < sourceData.length && i < backBuffer.length; i++) {
      const rawValue = sourceData[i]
      const normalized = Math.max(0, Math.min(1, (rawValue - lower) / range))
      backBuffer[i] = Math.floor(normalized * 255)
    }

    this.commitBackBuffer()
  }

  dispose(): void {
    this.spinlock.withLock(() => {
      Atomics.store(this.atomicArray, ATOMIC_DATA_READY_OFFSET, BUFFER_FLAG_DIRTY)
    })
  }
}

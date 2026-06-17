import type { VolumeData, VolumeDimensions, VolumeSpacing } from '@/types'

export class VolumeBuilder {
  private width: number
  private height: number
  private depth: number
  private spacingX: number = 1.0
  private spacingY: number = 1.0
  private spacingZ: number = 1.0
  private voxelData: Uint16Array
  private built: boolean = false
  private minValue: number = 65535
  private maxValue: number = 0

  constructor(width: number, height: number, depth: number) {
    this.width = width
    this.height = height
    this.depth = depth
    this.voxelData = new Uint16Array(width * height * depth)
  }

  setSpacing(sx: number, sy: number, sz: number): void {
    this.spacingX = sx
    this.spacingY = sy
    this.spacingZ = sz
  }

  addSlice(zIndex: number, sliceData: Uint16Array, sliceSize: number): boolean {
    if (zIndex < 0 || zIndex >= this.depth) {
      return false
    }

    const expectedSize = this.width * this.height
    if (sliceSize !== expectedSize) {
      return false
    }

    const offset = zIndex * this.width * this.height
    this.voxelData.set(sliceData, offset)

    return true
  }

  buildVolume(): boolean {
    this.minValue = 65535
    this.maxValue = 0

    for (let i = 0; i < this.voxelData.length; i++) {
      const value = this.voxelData[i]
      if (value < this.minValue) this.minValue = value
      if (value > this.maxValue) this.maxValue = value
    }

    if (this.minValue > this.maxValue) {
      this.minValue = 0
      this.maxValue = 0
    }

    this.built = true
    return true
  }

  getVoxelData(): Uint16Array {
    return this.voxelData
  }

  getWidth(): number {
    return this.width
  }

  getHeight(): number {
    return this.height
  }

  getDepth(): number {
    return this.depth
  }

  getSpacing(): VolumeSpacing {
    return {
      x: this.spacingX,
      y: this.spacingY,
      z: this.spacingZ
    }
  }

  private isValidCoordinate(x: number, y: number, z: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height && z >= 0 && z < this.depth
  }

  getVoxel(x: number, y: number, z: number): number {
    if (!this.isValidCoordinate(x, y, z)) {
      return 0
    }
    const index = z * this.width * this.height + y * this.width + x
    return this.voxelData[index]
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
  }

  sampleVolume(x: number, y: number, z: number): number {
    let fx = x
    let fy = y
    let fz = z

    if (fx < 0) fx = 0
    if (fx > this.width - 1) fx = this.width - 1
    if (fy < 0) fy = 0
    if (fy > this.height - 1) fy = this.height - 1
    if (fz < 0) fz = 0
    if (fz > this.depth - 1) fz = this.depth - 1

    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const z0 = Math.floor(fz)
    let x1 = x0 + 1
    let y1 = y0 + 1
    let z1 = z0 + 1

    if (x1 >= this.width) x1 = this.width - 1
    if (y1 >= this.height) y1 = this.height - 1
    if (z1 >= this.depth) z1 = this.depth - 1

    const tx = fx - x0
    const ty = fy - y0
    const tz = fz - z0

    const v000 = this.getVoxel(x0, y0, z0)
    const v100 = this.getVoxel(x1, y0, z0)
    const v010 = this.getVoxel(x0, y1, z0)
    const v110 = this.getVoxel(x1, y1, z0)
    const v001 = this.getVoxel(x0, y0, z1)
    const v101 = this.getVoxel(x1, y0, z1)
    const v011 = this.getVoxel(x0, y1, z1)
    const v111 = this.getVoxel(x1, y1, z1)

    const v00 = this.lerp(v000, v100, tx)
    const v10 = this.lerp(v010, v110, tx)
    const v01 = this.lerp(v001, v101, tx)
    const v11 = this.lerp(v011, v111, tx)

    const v0 = this.lerp(v00, v10, ty)
    const v1 = this.lerp(v01, v11, ty)

    const v = this.lerp(v0, v1, tz)

    return v
  }

  getMinValue(): number {
    return this.minValue
  }

  getMaxValue(): number {
    return this.maxValue
  }

  getVolumeData(): VolumeData {
    if (!this.built) {
      this.buildVolume()
    }

    return {
      dimensions: {
        width: this.width,
        height: this.height,
        depth: this.depth
      } as VolumeDimensions,
      spacing: {
        x: this.spacingX,
        y: this.spacingY,
        z: this.spacingZ
      } as VolumeSpacing,
      voxelData: this.voxelData,
      metadata: null,
      minValue: this.minValue,
      maxValue: this.maxValue
    }
  }
}

export function createVolumeBuilder(width: number, height: number, depth: number): VolumeBuilder {
  return new VolumeBuilder(width, height, depth)
}

export function buildVolumeFromSlices(
  slices: (Uint16Array | Float32Array)[],
  width: number,
  height: number,
  spacing: VolumeSpacing
): VolumeData {
  const depth = slices.length
  const builder = new VolumeBuilder(width, height, depth)
  builder.setSpacing(spacing.x, spacing.y, spacing.z)

  for (let z = 0; z < depth; z++) {
    const sliceData = slices[z]
    if (sliceData instanceof Uint16Array) {
      builder.addSlice(z, sliceData, width * height)
    } else {
      const uint16Data = new Uint16Array(width * height)
      for (let i = 0; i < sliceData.length; i++) {
        uint16Data[i] = Math.max(0, Math.min(65535, Math.round(sliceData[i])))
      }
      builder.addSlice(z, uint16Data, width * height)
    }
  }

  builder.buildVolume()
  return builder.getVolumeData()
}

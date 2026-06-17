import type { SphereMask, MaskVolumeResult, VolumeData, VolumeSpacing, VolumeDimensions } from '@/types'

const MASK_VALUE_INSIDE = 255
const MASK_VALUE_BORDER = 128
const MASK_VALUE_OUTSIDE = 0

export class MaskManager {
  private spheres: SphereMask[] = []
  private volumeData: VolumeData | null = null
  private maskTextureData: Uint8Array | null = null
  private dirty: boolean = true
  private sphereIdCounter: number = 0

  private cachedVolume: MaskVolumeResult | null = null

  setVolumeData(volumeData: VolumeData): void {
    this.volumeData = volumeData
    const { width, height, depth } = volumeData.dimensions
    const totalVoxels = width * height * depth

    if (!this.maskTextureData || this.maskTextureData.length !== totalVoxels) {
      this.maskTextureData = new Uint8Array(totalVoxels)
    } else {
      this.maskTextureData.fill(0)
    }

    this.dirty = true
    this.cachedVolume = null
    this.rebuildAllSpheres()
  }

  getMaskTextureData(): Uint8Array | null {
    if (this.dirty) {
      this.rebuildAllSpheres()
    }
    return this.maskTextureData
  }

  addSphere(centerX: number, centerY: number, centerZ: number, radius: number): SphereMask {
    const sphere: SphereMask = {
      id: `sphere-${++this.sphereIdCounter}-${Date.now()}`,
      centerX,
      centerY,
      centerZ,
      radius,
      color: this.generateSphereColor(this.sphereIdCounter)
    }

    this.spheres.push(sphere)
    this.dirty = true
    this.cachedVolume = null
    this.rasterizeSphere(sphere)

    return sphere
  }

  removeSphere(sphereId: string): boolean {
    const index = this.spheres.findIndex(s => s.id === sphereId)
    if (index === -1) return false

    this.spheres.splice(index, 1)
    this.dirty = true
    this.cachedVolume = null

    this.rebuildAllSpheres()
    return true
  }

  updateSphere(sphereId: string, updates: Partial<SphereMask>): boolean {
    const sphere = this.spheres.find(s => s.id === sphereId)
    if (!sphere) return false

    Object.assign(sphere, updates)
    this.dirty = true
    this.cachedVolume = null

    this.rebuildAllSpheres()
    return true
  }

  clearAllSpheres(): void {
    this.spheres = []
    if (this.maskTextureData) {
      this.maskTextureData.fill(0)
    }
    this.dirty = false
    this.cachedVolume = {
      voxelCount: 0,
      volumeMm3: 0,
      volumeCm3: 0
    }
  }

  getSpheres(): SphereMask[] {
    return [...this.spheres]
  }

  setSpheres(spheres: SphereMask[]): void {
    this.spheres = [...spheres]
    this.dirty = true
    this.cachedVolume = null
  }

  getSphereCount(): number {
    return this.spheres.length
  }

  calculateTotalVolume(): MaskVolumeResult {
    if (this.cachedVolume && !this.dirty) {
      return this.cachedVolume
    }

    if (!this.volumeData || !this.maskTextureData) {
      this.cachedVolume = {
        voxelCount: 0,
        volumeMm3: 0,
        volumeCm3: 0
      }
      return this.cachedVolume
    }

    let voxelCount = 0
    const data = this.maskTextureData

    for (let i = 0; i < data.length; i++) {
      if (data[i] > 128) {
        voxelCount++
      }
    }

    const { x: sx, y: sy, z: sz } = this.volumeData.spacing
    const voxelVolumeMm3 = sx * sy * sz
    const volumeMm3 = voxelCount * voxelVolumeMm3
    const volumeCm3 = volumeMm3 / 1000

    this.cachedVolume = {
      voxelCount,
      volumeMm3: Math.round(volumeMm3 * 100) / 100,
      volumeCm3: Math.round(volumeCm3 * 100) / 100,
      surfaceAreaMm2: this.estimateSurfaceArea()
    }

    return this.cachedVolume
  }

  private estimateSurfaceArea(): number {
    if (!this.volumeData || !this.maskTextureData) return 0

    const { width, height, depth } = this.volumeData.dimensions
    const { x: sx, y: sy, z: sz } = this.volumeData.spacing
    const data = this.maskTextureData

    let surfaceVoxels = 0
    const threshold = 128

    for (let z = 1; z < depth - 1; z++) {
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = z * width * height + y * width + x
          if (data[idx] > threshold) {
            const isSurface =
              data[idx - 1] <= threshold ||
              data[idx + 1] <= threshold ||
              data[idx - width] <= threshold ||
              data[idx + width] <= threshold ||
              data[idx - width * height] <= threshold ||
              data[idx + width * height] <= threshold

            if (isSurface) {
              surfaceVoxels++
            }
          }
        }
      }
    }

    const faceArea = sx * sy
    return surfaceVoxels * faceArea
  }

  calculateSphereVolume(sphereId: string): MaskVolumeResult | null {
    const sphere = this.spheres.find(s => s.id === sphereId)
    if (!sphere || !this.volumeData) return null

    const { x: sx, y: sy, z: sz } = this.volumeData.spacing

    const radiusX = sphere.radius / sx
    const radiusY = sphere.radius / sy
    const radiusZ = sphere.radius / sz

    const volumeVoxels = (4 / 3) * Math.PI * radiusX * radiusY * radiusZ
    const volumeMm3 = (4 / 3) * Math.PI * Math.pow(sphere.radius, 3)

    return {
      voxelCount: Math.round(volumeVoxels),
      volumeMm3: Math.round(volumeMm3 * 100) / 100,
      volumeCm3: Math.round((volumeMm3 / 1000) * 100) / 100
    }
  }

  private rebuildAllSpheres(): void {
    if (!this.maskTextureData) return

    this.maskTextureData.fill(0)

    for (const sphere of this.spheres) {
      this.rasterizeSphere(sphere)
    }

    this.dirty = false
  }

  private rasterizeSphere(sphere: SphereMask): void {
    if (!this.volumeData || !this.maskTextureData) return

    const { width, height, depth } = this.volumeData.dimensions
    const { x: sx, y: sy, z: sz } = this.volumeData.spacing
    const data = this.maskTextureData

    const cx = sphere.centerX
    const cy = sphere.centerY
    const cz = sphere.centerZ
    const r = sphere.radius

    const minX = Math.max(0, Math.floor((cx - r) / sx))
    const maxX = Math.min(width - 1, Math.ceil((cx + r) / sx))
    const minY = Math.max(0, Math.floor((cy - r) / sy))
    const maxY = Math.min(height - 1, Math.ceil((cy + r) / sy))
    const minZ = Math.max(0, Math.floor((cz - r) / sz))
    const maxZ = Math.min(depth - 1, Math.ceil((cz + r) / sz))

    const rSq = r * r

    for (let z = minZ; z <= maxZ; z++) {
      const dz = (z * sz) - cz
      const dzSq = dz * dz

      for (let y = minY; y <= maxY; y++) {
        const dy = (y * sy) - cy
        const dySq = dy * dy

        const rowOffset = z * width * height + y * width

        for (let x = minX; x <= maxX; x++) {
          const dx = (x * sx) - cx
          const dxSq = dx * dx

          const distSq = dxSq + dySq + dzSq

          if (distSq <= rSq) {
            data[rowOffset + x] = MASK_VALUE_INSIDE
          }
        }
      }
    }
  }

  pointToVoxel(
    plane: 'axial' | 'sagittal' | 'coronal',
    planeIndex: number,
    uvX: number,
    uvY: number,
    zoom: number,
    pan: { x: number; y: number }
  ): { x: number; y: number; z: number } | null {
    if (!this.volumeData) return null

    const { width, height, depth } = this.volumeData.dimensions

    const adjustedUV = {
      x: (uvX - pan.x) * zoom,
      y: (uvY - pan.y) * zoom
    }

    let x = 0, y = 0, z = 0

    if (plane === 'axial') {
      x = Math.floor((adjustedUV.x * 0.5 + 0.5) * width)
      y = Math.floor((adjustedUV.y * 0.5 + 0.5) * height)
      z = planeIndex
    } else if (plane === 'sagittal') {
      x = planeIndex
      y = Math.floor((adjustedUV.x * 0.5 + 0.5) * height)
      z = Math.floor((adjustedUV.y * 0.5 + 0.5) * depth)
    } else {
      x = Math.floor((adjustedUV.x * 0.5 + 0.5) * width)
      y = planeIndex
      z = Math.floor((adjustedUV.y * 0.5 + 0.5) * depth)
    }

    if (x < 0 || x >= width || y < 0 || y >= height || z < 0 || z >= depth) {
      return null
    }

    return { x, y, z }
  }

  voxelToWorld(voxelX: number, voxelY: number, voxelZ: number): { x: number; y: number; z: number } | null {
    if (!this.volumeData) return null

    const { x: sx, y: sy, z: sz } = this.volumeData.spacing

    return {
      x: voxelX * sx,
      y: voxelY * sy,
      z: voxelZ * sz
    }
  }

  screenToWorldSphere(
    plane: 'axial' | 'sagittal' | 'coronal',
    planeIndex: number,
    uvX: number,
    uvY: number,
    radiusPixels: number,
    zoom: number,
    pan: { x: number; y: number }
  ): { centerX: number; centerY: number; centerZ: number; radius: number } | null {
    const voxelPos = this.pointToVoxel(plane, planeIndex, uvX, uvY, zoom, pan)
    if (!voxelPos || !this.volumeData) return null

    const worldPos = this.voxelToWorld(voxelPos.x, voxelPos.y, voxelPos.z)
    if (!worldPos) return null

    const { x: sx, y: sy } = this.volumeData.spacing
    const pixelSpacing = (sx + sy) / 2
    const radiusWorld = radiusPixels * pixelSpacing / zoom

    return {
      centerX: worldPos.x,
      centerY: worldPos.y,
      centerZ: worldPos.z,
      radius: radiusWorld
    }
  }

  isDirty(): boolean {
    return this.dirty
  }

  markClean(): void {
    this.dirty = false
  }

  markDirty(): void {
    this.dirty = true
    this.cachedVolume = null
  }

  private generateSphereColor(index: number): string {
    const colors = [
      '#ff4444',
      '#ff9800',
      '#ffeb3b',
      '#4caf50',
      '#2196f3',
      '#9c27b0',
      '#00bcd4',
      '#e91e63'
    ]
    return colors[index % colors.length]
  }

  getDimensions(): VolumeDimensions | null {
    return this.volumeData?.dimensions || null
  }

  getSpacing(): VolumeSpacing | null {
    return this.volumeData?.spacing || null
  }
}

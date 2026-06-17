import type { VolumeData, VolumeSpacing } from '@/types'
import { createVolumeBuilder } from '@/volume/VolumeBuilder'

export function generatePhantomVolume(
  width: number = 256,
  height: number = 256,
  depth: number = 128,
  spacing: VolumeSpacing = { x: 1.0, y: 1.0, z: 1.0 }
): VolumeData {
  const builder = createVolumeBuilder(width, height, depth)
  builder.setSpacing(spacing.x, spacing.y, spacing.z)

  const centerX = width / 2
  const centerY = height / 2
  const centerZ = depth / 2

  const maxRadiusX = width * 0.4
  const maxRadiusY = height * 0.4
  const maxRadiusZ = depth * 0.4

  for (let z = 0; z < depth; z++) {
    const sliceData = new Uint16Array(width * height)
    const normalizedZ = (z - centerZ) / maxRadiusZ
    const zFactor = 1 - normalizedZ * normalizedZ

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x

        const dx = (x - centerX) / maxRadiusX
        const dy = (y - centerY) / maxRadiusY
        const distFromCenter = Math.sqrt(dx * dx + dy * dy)

        if (distFromCenter * distFromCenter + normalizedZ * normalizedZ <= 1.0) {
          let value = 0

          const innerRadius = 0.6
          if (distFromCenter < innerRadius * zFactor) {
            value = 2000
          } else if (distFromCenter < 0.8 * zFactor) {
            value = 1000
          } else {
            value = 500
          }

          const sphereCenterX = centerX + width * 0.15
          const sphereCenterY = centerY - height * 0.1
          const sphereRadius = Math.min(width, height) * 0.12
          const sphereDistX = (x - sphereCenterX) / sphereRadius
          const sphereDistY = (y - sphereCenterY) / sphereRadius
          const sphereDistZ = (z - centerZ - depth * 0.1) / (depth * 0.15)
          const sphereDist = Math.sqrt(sphereDistX * sphereDistX + sphereDistY * sphereDistY + sphereDistZ * sphereDistZ)

          if (sphereDist < 1.0) {
            value = Math.max(value, 3000)
          }

          const tubeCenterX = centerX - width * 0.2
          const tubeRadius = Math.min(width, height) * 0.05
          const tubeDist = Math.sqrt((x - tubeCenterX) * (x - tubeCenterX) + (y - centerY) * (y - centerY))
          if (tubeDist < tubeRadius) {
            value = Math.max(value, 2500)
          }

          const noise = (Math.sin(x * 0.3) * Math.cos(y * 0.25) * Math.sin(z * 0.2)) * 50
          value = Math.max(0, Math.min(4095, value + noise))

          sliceData[idx] = value
        } else {
          sliceData[idx] = 0
        }
      }
    }

    builder.addSlice(z, sliceData, width * height)
  }

  builder.buildVolume()
  return builder.getVolumeData()
}

export function generateSimpleCubeVolume(
  size: number = 128,
  spacing: VolumeSpacing = { x: 1.0, y: 1.0, z: 1.0 }
): VolumeData {
  const builder = createVolumeBuilder(size, size, size)
  builder.setSpacing(spacing.x, spacing.y, spacing.z)

  for (let z = 0; z < size; z++) {
    const sliceData = new Uint16Array(size * size)

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = y * size + x

        const border = 10
        const isXBorder = x < border || x >= size - border
        const isYBorder = y < border || y >= size - border
        const isZBorder = z < border || z >= size - border

        if (isXBorder || isYBorder || isZBorder) {
          sliceData[idx] = 3000
        } else {
          const cx = size / 2
          const cy = size / 2
          const cz = size / 2
          const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2)
          const maxDist = size * 0.4

          if (dist < maxDist) {
            const t = dist / maxDist
            sliceData[idx] = Math.floor(2000 * (1 - t * t))
          } else {
            sliceData[idx] = 100
          }
        }
      }
    }

    builder.addSlice(z, sliceData, size * size)
  }

  builder.buildVolume()
  return builder.getVolumeData()
}

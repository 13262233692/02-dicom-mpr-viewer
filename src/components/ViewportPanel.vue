<template>
  <div class="viewport-panel" :class="{ active: active }">
    <div class="viewport-header">
      <span class="viewport-title">{{ planeLabel }}</span>
      <span class="viewport-index">{{ currentSlice }} / {{ maxSlice }}</span>
    </div>
    <div
      ref="viewportRef"
      class="viewport-container"
      :class="{ 'mask-cursor': maskToolMode === 'draw' || maskToolMode === 'erase' }"
    ></div>

    <div
      v-if="showBrushIndicator && brushRadius > 0"
      ref="brushCursorRef"
      class="brush-indicator"
      :style="brushCursorStyle"
    >
      <div class="brush-circle"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, reactive } from 'vue'
import { VolumeRenderer } from '@/rendering/VolumeRenderer'
import type { VolumeData, MPRPlane, MaskToolMode } from '@/types'

const props = defineProps<{
  plane: MPRPlane
  volumeData: VolumeData | null
  sliceIndex: number
  windowWidth: number
  windowLevel: number
  active?: boolean
  maskEnabled?: boolean
  maskOpacity?: number
  brushRadius?: number
  maskToolMode?: MaskToolMode
}>()

const emit = defineEmits<{
  (e: 'sliceChange', value: number): void
  (e: 'maskChanged'): void
}>()

const viewportRef = ref<HTMLElement | null>(null)
const brushCursorRef = ref<HTMLElement | null>(null)
let renderer: VolumeRenderer | null = null

const brushPosition = reactive({ x: 0, y: 0, visible: false })

const planeLabels: Record<MPRPlane, string> = {
  axial: '轴状面 Axial',
  sagittal: '矢状面 Sagittal',
  coronal: '冠状面 Coronal'
}

const planeLabel = computed(() => planeLabels[props.plane])

const currentSlice = ref(0)
const maxSlice = ref(1)

const showBrushIndicator = computed(() => {
  return props.maskToolMode === 'draw' || props.maskToolMode === 'erase'
})

const brushCursorStyle = computed(() => {
  const size = (props.brushRadius || 5) * 4
  return {
    width: `${size}px`,
    height: `${size}px`,
    left: `${brushPosition.x - size / 2}px`,
    top: `${brushPosition.y - size / 2}px`,
    opacity: brushPosition.visible ? 1 : 0
  }
})

watch(() => props.volumeData, (newData) => {
  if (renderer && newData) {
    renderer.setVolumeData(newData)
    maxSlice.value = renderer.getMaxSliceIndex()
    currentSlice.value = Math.floor(maxSlice.value / 2)
    emit('sliceChange', currentSlice.value)
  }
}, { deep: false })

watch(() => props.sliceIndex, (newIndex) => {
  if (renderer) {
    renderer.setSliceIndex(newIndex)
    currentSlice.value = renderer.getSliceIndex()
  }
})

watch([() => props.windowWidth, () => props.windowLevel], ([ww, wl]) => {
  if (renderer) {
    renderer.setWindowLevel(ww, wl)
  }
})

watch(() => props.maskEnabled, (enabled) => {
  if (renderer && enabled !== undefined) {
    renderer.setMaskEnabled(enabled)
  }
})

watch(() => props.maskOpacity, (opacity) => {
  if (renderer && opacity !== undefined) {
    renderer.setMaskOpacity(opacity)
  }
})

watch(() => props.brushRadius, (radius) => {
  if (renderer && radius !== undefined) {
    renderer.setBrushRadius(radius)
  }
})

watch(() => props.maskToolMode, (mode) => {
  if (renderer && mode !== undefined) {
    renderer.setMaskToolMode(mode)
  }
})

onMounted(() => {
  if (viewportRef.value) {
    renderer = new VolumeRenderer(viewportRef.value, props.plane)

    renderer.setOnMaskChanged(() => {
      emit('maskChanged')
    })

    if (props.volumeData) {
      renderer.setVolumeData(props.volumeData)
      maxSlice.value = renderer.getMaxSliceIndex()
    }

    if (props.maskEnabled !== undefined) {
      renderer.setMaskEnabled(props.maskEnabled)
    }
    if (props.maskOpacity !== undefined) {
      renderer.setMaskOpacity(props.maskOpacity)
    }
    if (props.brushRadius !== undefined) {
      renderer.setBrushRadius(props.brushRadius)
    }
    if (props.maskToolMode !== undefined) {
      renderer.setMaskToolMode(props.maskToolMode)
    }

    viewportRef.value.addEventListener('mousemove', handleMouseMove)
    viewportRef.value.addEventListener('mouseenter', handleMouseEnter)
    viewportRef.value.addEventListener('mouseleave', handleMouseLeave)

    window.addEventListener('resize', handleResize)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)

  if (viewportRef.value) {
    viewportRef.value.removeEventListener('mousemove', handleMouseMove)
    viewportRef.value.removeEventListener('mouseenter', handleMouseEnter)
    viewportRef.value.removeEventListener('mouseleave', handleMouseLeave)
  }

  if (renderer) {
    renderer.dispose()
    renderer = null
  }
})

function handleMouseMove(e: MouseEvent) {
  if (viewportRef.value) {
    const rect = viewportRef.value.getBoundingClientRect()
    brushPosition.x = e.clientX - rect.left
    brushPosition.y = e.clientY - rect.top
  }
}

function handleMouseEnter() {
  brushPosition.visible = true
}

function handleMouseLeave() {
  brushPosition.visible = false
}

function handleResize() {
  if (renderer) {
    renderer.resize()
  }
}

function getRenderer(): VolumeRenderer | null {
  return renderer
}

defineExpose({
  getRenderer
})
</script>

<style lang="scss" scoped>
.viewport-panel {
  position: relative;
  background: #0a0c10;
  border: 1px solid #1e2430;
  border-radius: 6px;
  overflow: hidden;
  transition: border-color 0.2s ease;

  &:hover {
    border-color: #2a3444;
  }

  &.active {
    border-color: #00d4ff;
    box-shadow: 0 0 20px rgba(0, 212, 255, 0.15);
  }
}

.viewport-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 8px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(to bottom, rgba(10, 12, 16, 0.9), transparent);
  z-index: 10;
  pointer-events: none;
}

.viewport-title {
  font-size: 12px;
  font-weight: 600;
  color: #8892a6;
  letter-spacing: 0.5px;
}

.viewport-index {
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  color: #00d4ff;
  background: rgba(0, 212, 255, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
}

.viewport-container {
  width: 100%;
  height: 100%;
  cursor: grab;

  &:active {
    cursor: grabbing;
  }

  &.mask-cursor {
    cursor: none;
  }
}

.brush-indicator {
  position: absolute;
  pointer-events: none;
  z-index: 20;
  transition: opacity 0.15s ease;
}

.brush-circle {
  width: 100%;
  height: 100%;
  border: 2px solid #00e5ff;
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(0, 229, 255, 0.5), inset 0 0 10px rgba(0, 229, 255, 0.2);
  box-sizing: border-box;
}
</style>

<template>
  <div class="viewport-panel" :class="{ active: active }">
    <div class="viewport-header">
      <span class="viewport-title">{{ planeLabel }}</span>
      <span class="viewport-index">{{ currentSlice }} / {{ maxSlice }}</span>
    </div>
    <div ref="viewportRef" class="viewport-container"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { VolumeRenderer } from '@/rendering/VolumeRenderer'
import type { VolumeData, MPRPlane } from '@/types'

const props = defineProps<{
  plane: MPRPlane
  volumeData: VolumeData | null
  sliceIndex: number
  windowWidth: number
  windowLevel: number
  active?: boolean
}>()

const emit = defineEmits<{
  (e: 'sliceChange', value: number): void
}>()

const viewportRef = ref<HTMLElement | null>(null)
let renderer: VolumeRenderer | null = null

const planeLabels: Record<MPRPlane, string> = {
  axial: '轴状面 Axial',
  sagittal: '矢状面 Sagittal',
  coronal: '冠状面 Coronal'
}

const planeLabel = computed(() => planeLabels[props.plane])

const currentSlice = ref(0)
const maxSlice = ref(1)

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

onMounted(() => {
  if (viewportRef.value) {
    renderer = new VolumeRenderer(viewportRef.value, props.plane)

    if (props.volumeData) {
      renderer.setVolumeData(props.volumeData)
      maxSlice.value = renderer.getMaxSliceIndex()
    }

    window.addEventListener('resize', handleResize)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (renderer) {
    renderer.dispose()
    renderer = null
  }
})

function handleResize() {
  if (renderer) {
    renderer.resize()
  }
}
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
}
</style>

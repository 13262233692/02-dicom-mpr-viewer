<template>
  <div class="status-bar">
    <div class="status-left">
      <span v-if="volumeInfo" class="status-item">
        <Layers :size="14" />
        <span>{{ volumeInfo.dimensions }}</span>
      </span>
      <span v-if="volumeInfo" class="status-item">
        <Maximize2 :size="14" />
        <span>{{ volumeInfo.spacing }}</span>
      </span>
      <span v-if="volumeInfo?.modality" class="status-item status-badge">
        {{ volumeInfo.modality }}
      </span>
    </div>
    <div class="status-right">
      <span v-if="activeView" class="status-item">
        当前视图: {{ activeViewLabel }}
      </span>
      <span class="status-item status-version">
        v1.0.0
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Layers, Maximize2 } from 'lucide-vue-next'
import type { VolumeData, MPRPlane } from '@/types'

const props = defineProps<{
  volumeData: VolumeData | null
  activeView: MPRPlane | null
}>()

const planeLabels: Record<MPRPlane, string> = {
  axial: '轴状面',
  sagittal: '矢状面',
  coronal: '冠状面'
}

const activeViewLabel = computed(() => {
  return props.activeView ? planeLabels[props.activeView] : '-'
})

const volumeInfo = computed(() => {
  if (!props.volumeData) return null
  return {
    dimensions: `${props.volumeData.dimensions.width} × ${props.volumeData.dimensions.height} × ${props.volumeData.dimensions.depth}`,
    spacing: `${props.volumeData.spacing.x.toFixed(2)} × ${props.volumeData.spacing.y.toFixed(2)} × ${props.volumeData.spacing.z.toFixed(2)} mm`,
    modality: props.volumeData.metadata?.modality || ''
  }
})
</script>

<style lang="scss" scoped>
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 32px;
  background: #0f131a;
  border-top: 1px solid #1e2430;
  font-size: 11px;
}

.status-left,
.status-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #6b7280;

  svg {
    opacity: 0.7;
  }
}

.status-badge {
  background: rgba(0, 212, 255, 0.1);
  color: #00d4ff;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.status-version {
  color: #4b5563;
  font-family: 'JetBrains Mono', monospace;
}
</style>

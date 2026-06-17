<template>
  <div class="control-panel">
    <div class="panel-section">
      <div class="section-header" @click="toggleSection('slice')">
        <span class="section-title">切层控制</span>
        <ChevronDown v-if="sections.slice" :size="16" />
        <ChevronRight v-else :size="16" />
      </div>
      <div v-show="sections.slice" class="section-content">
        <div class="control-group">
          <label>轴状面 (Axial)</label>
          <div class="slider-row">
            <input
              type="range"
              :min="0"
              :max="maxSlices.axial"
              :value="sliceIndices.axial"
              @input="onSliceChange('axial', $event)"
              class="slider"
            />
            <span class="slider-value">{{ sliceIndices.axial }}</span>
          </div>
        </div>
        <div class="control-group">
          <label>矢状面 (Sagittal)</label>
          <div class="slider-row">
            <input
              type="range"
              :min="0"
              :max="maxSlices.sagittal"
              :value="sliceIndices.sagittal"
              @input="onSliceChange('sagittal', $event)"
              class="slider"
            />
            <span class="slider-value">{{ sliceIndices.sagittal }}</span>
          </div>
        </div>
        <div class="control-group">
          <label>冠状面 (Coronal)</label>
          <div class="slider-row">
            <input
              type="range"
              :min="0"
              :max="maxSlices.coronal"
              :value="sliceIndices.coronal"
              @input="onSliceChange('coronal', $event)"
              class="slider"
            />
            <span class="slider-value">{{ sliceIndices.coronal }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="panel-section">
      <div class="section-header" @click="toggleSection('window')">
        <span class="section-title">窗宽窗位</span>
        <ChevronDown v-if="sections.window" :size="16" />
        <ChevronRight v-else :size="16" />
      </div>
      <div v-show="sections.window" class="section-content">
        <div class="control-group">
          <label>窗宽 (Window Width)</label>
          <div class="slider-row">
            <input
              type="range"
              :min="1"
              :max="4096"
              :value="windowWidth"
              @input="onWindowWidthChange"
              class="slider"
            />
            <span class="slider-value">{{ windowWidth }}</span>
          </div>
        </div>
        <div class="control-group">
          <label>窗位 (Window Level)</label>
          <div class="slider-row">
            <input
              type="range"
              :min="0"
              :max="4095"
              :value="windowLevel"
              @input="onWindowLevelChange"
              class="slider"
            />
            <span class="slider-value">{{ windowLevel }}</span>
          </div>
        </div>
        <div class="preset-row">
          <button
            v-for="preset in windowPresets"
            :key="preset.name"
            class="preset-btn"
            @click="applyPreset(preset)"
          >
            {{ preset.name }}
          </button>
        </div>
      </div>
    </div>

    <div class="panel-section">
      <div class="section-header" @click="toggleSection('info')">
        <span class="section-title">图像信息</span>
        <ChevronDown v-if="sections.info" :size="16" />
        <ChevronRight v-else :size="16" />
      </div>
      <div v-show="sections.info" class="section-content">
        <div v-if="volumeInfo" class="info-grid">
          <div class="info-item">
            <span class="info-label">尺寸</span>
            <span class="info-value">{{ volumeInfo.dimensions }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">间距</span>
            <span class="info-value">{{ volumeInfo.spacing }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">最小值</span>
            <span class="info-value">{{ volumeInfo.minValue }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">最大值</span>
            <span class="info-value">{{ volumeInfo.maxValue }}</span>
          </div>
          <div v-if="volumeInfo.modality" class="info-item">
            <span class="info-label">模态</span>
            <span class="info-value">{{ volumeInfo.modality }}</span>
          </div>
        </div>
        <div v-else class="no-data">
          <FileQuestion :size="32" />
          <span>暂无数据</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { ChevronDown, ChevronRight, FileQuestion } from 'lucide-vue-next'
import type { VolumeData, MPRPlane } from '@/types'

const props = defineProps<{
  volumeData: VolumeData | null
  sliceIndices: Record<MPRPlane, number>
  windowWidth: number
  windowLevel: number
}>()

const emit = defineEmits<{
  (e: 'sliceChange', plane: MPRPlane, index: number): void
  (e: 'windowChange', width: number, level: number): void
}>()

const sections = reactive({
  slice: true,
  window: true,
  info: true
})

const windowPresets = [
  { name: '肺窗', width: 1500, level: -600 },
  { name: '纵隔', width: 350, level: 50 },
  { name: '骨窗', width: 2000, level: 400 },
  { name: '脑组织', width: 80, level: 40 },
  { name: '腹部', width: 350, level: 50 }
]

const maxSlices = computed(() => {
  if (!props.volumeData) {
    return { axial: 100, sagittal: 100, coronal: 100 }
  }
  return {
    axial: props.volumeData.dimensions.depth - 1,
    sagittal: props.volumeData.dimensions.width - 1,
    coronal: props.volumeData.dimensions.height - 1
  }
})

const volumeInfo = computed(() => {
  if (!props.volumeData) return null
  return {
    dimensions: `${props.volumeData.dimensions.width} × ${props.volumeData.dimensions.height} × ${props.volumeData.dimensions.depth}`,
    spacing: `${props.volumeData.spacing.x.toFixed(2)} × ${props.volumeData.spacing.y.toFixed(2)} × ${props.volumeData.spacing.z.toFixed(2)} mm`,
    minValue: props.volumeData.minValue,
    maxValue: props.volumeData.maxValue,
    modality: props.volumeData.metadata?.modality || ''
  }
})

function toggleSection(section: keyof typeof sections) {
  sections[section] = !sections[section]
}

function onSliceChange(plane: MPRPlane, event: Event) {
  const target = event.target as HTMLInputElement
  emit('sliceChange', plane, parseInt(target.value, 10))
}

function onWindowWidthChange(event: Event) {
  const target = event.target as HTMLInputElement
  emit('windowChange', parseInt(target.value, 10), props.windowLevel)
}

function onWindowLevelChange(event: Event) {
  const target = event.target as HTMLInputElement
  emit('windowChange', props.windowWidth, parseInt(target.value, 10))
}

function applyPreset(preset: { width: number; level: number }) {
  emit('windowChange', preset.width, preset.level)
}
</script>

<style lang="scss" scoped>
.control-panel {
  width: 280px;
  background: #12171f;
  border-left: 1px solid #1e2430;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.panel-section {
  border-bottom: 1px solid #1e2430;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s ease;

  &:hover {
    background: #161c26;
  }
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #e0e6ed;
}

.section-content {
  padding: 0 16px 16px;
}

.control-group {
  margin-bottom: 14px;

  &:last-child {
    margin-bottom: 0;
  }

  label {
    display: block;
    font-size: 11px;
    color: #6b7280;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.slider {
  flex: 1;
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  background: #1e2430;
  border-radius: 2px;
  outline: none;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    background: #00d4ff;
    border-radius: 50%;
    cursor: pointer;
    transition: transform 0.15s ease;

    &:hover {
      transform: scale(1.2);
    }
  }

  &::-moz-range-thumb {
    width: 14px;
    height: 14px;
    background: #00d4ff;
    border-radius: 50%;
    cursor: pointer;
    border: none;
  }
}

.slider-value {
  min-width: 40px;
  text-align: right;
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
  color: #8892a6;
}

.preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.preset-btn {
  padding: 4px 10px;
  background: #1a202c;
  border: 1px solid #2a3444;
  border-radius: 4px;
  color: #8892a6;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #242d3d;
    border-color: #3a4558;
    color: #e0e6ed;
  }
}

.info-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-label {
  font-size: 12px;
  color: #6b7280;
}

.info-value {
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
  color: #e0e6ed;
}

.no-data {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 0;
  color: #4b5563;

  svg {
    opacity: 0.5;
  }

  span {
    font-size: 12px;
  }
}
</style>

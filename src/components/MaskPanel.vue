<template>
  <div class="mask-panel">
    <div class="panel-section">
      <div class="section-header" @click="toggleSection('mask')">
        <span class="section-title">
          <CircleDot :size="16" class="section-icon" />
          球形蒙版工具
        </span>
        <ChevronDown v-if="sections.mask" :size="16" />
        <ChevronRight v-else :size="16" />
      </div>
      <div v-show="sections.mask" class="section-content">
        <div class="tool-buttons">
          <button
            class="tool-btn"
            :class="{ active: toolMode === 'draw' }"
            @click="setToolMode('draw')"
            :title="'画笔工具 (滚轮调整大小)'"
          >
            <Paintbrush :size="18" />
            <span>画笔</span>
          </button>
          <button
            class="tool-btn"
            :class="{ active: toolMode === 'none' }"
            @click="setToolMode('none')"
            title="浏览模式"
          >
            <Move :size="18" />
            <span>浏览</span>
          </button>
          <button
            class="tool-btn danger"
            @click="clearMask"
            title="清除所有蒙版"
          >
            <Trash2 :size="18" />
            <span>清除</span>
          </button>
        </div>

        <div class="control-group">
          <div class="control-label-row">
            <label>画笔半径</label>
            <span class="value-badge">{{ brushRadius.toFixed(1) }} px</span>
          </div>
          <input
            type="range"
            :min="1"
            :max="50"
            :step="0.5"
            :value="brushRadius"
            @input="onBrushRadiusChange"
            class="slider accent-cyan"
          />
        </div>

        <div class="control-group">
          <div class="control-label-row">
            <label>蒙版透明度</label>
            <span class="value-badge">{{ (maskOpacity * 100).toFixed(0) }}%</span>
          </div>
          <input
            type="range"
            :min="0.1"
            :max="1"
            :step="0.05"
            :value="maskOpacity"
            @input="onMaskOpacityChange"
            class="slider accent-cyan"
          />
        </div>

        <div class="toggle-row">
          <label class="toggle-label">
            <input
              type="checkbox"
              :checked="maskEnabled"
              @change="onMaskEnabledChange"
              class="toggle-input"
            />
            <span class="toggle-slider"></span>
            <span class="toggle-text">显示蒙版</span>
          </label>
        </div>
      </div>
    </div>

    <div class="panel-section">
      <div class="section-header" @click="toggleSection('volume')">
        <span class="section-title">
          <Box :size="16" class="section-icon" />
          体积分析
        </span>
        <ChevronDown v-if="sections.volume" :size="16" />
        <ChevronRight v-else :size="16" />
      </div>
      <div v-show="sections.volume" class="section-content">
        <div v-if="volumeResult" class="volume-stats">
          <div class="stat-card primary">
            <div class="stat-value">{{ formatVolume(volumeResult.volumeMm3) }}</div>
            <div class="stat-unit">mm³</div>
            <div class="stat-label">物理体积</div>
          </div>

          <div class="stat-row">
            <div class="stat-item">
              <div class="stat-value small">{{ formatVolumeCm3(volumeResult.volumeCm3) }}</div>
              <div class="stat-label">cm³</div>
            </div>
            <div class="stat-item">
              <div class="stat-value small">{{ volumeResult.voxelCount.toLocaleString() }}</div>
              <div class="stat-label">体素数</div>
            </div>
          </div>

          <div v-if="volumeResult.surfaceAreaMm2" class="stat-row">
            <div class="stat-item full">
              <div class="stat-value small">{{ formatArea(volumeResult.surfaceAreaMm2) }}</div>
              <div class="stat-label">表面积 (mm²)</div>
            </div>
          </div>
        </div>

        <div v-else class="empty-stats">
          <Scan :size="32" class="empty-icon" />
          <p>使用画笔工具绘制蒙版</p>
          <p class="hint">在任一视图上拖动鼠标</p>
        </div>

        <div class="sphere-list" v-if="sphereCount > 0">
          <div class="list-header">
            <span>球体列表</span>
            <span class="count-badge">{{ sphereCount }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="panel-section">
      <div class="section-header" @click="toggleSection('info')">
        <span class="section-title">
          <Info :size="16" class="section-icon" />
          操作说明
        </span>
        <ChevronDown v-if="sections.info" :size="16" />
        <ChevronRight v-else :size="16" />
      </div>
      <div v-show="sections.info" class="section-content">
        <ul class="help-list">
          <li><kbd>左键拖动</kbd> 绘制球形蒙版</li>
          <li><kbd>滚轮</kbd> 调整画笔半径</li>
          <li><kbd>双击</kbd> 重置视图</li>
          <li><kbd>右键拖动</kbd> 平移视图</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import {
  ChevronDown,
  ChevronRight,
  CircleDot,
  Paintbrush,
  Move,
  Trash2,
  Box,
  Scan,
  Info
} from 'lucide-vue-next'
import type { MaskVolumeResult, MaskToolMode } from '@/types'

const props = defineProps<{
  maskEnabled: boolean
  maskOpacity: number
  brushRadius: number
  toolMode: MaskToolMode
  volumeResult: MaskVolumeResult | null
  sphereCount: number
}>()

const emit = defineEmits<{
  (e: 'maskEnabledChange', enabled: boolean): void
  (e: 'maskOpacityChange', opacity: number): void
  (e: 'brushRadiusChange', radius: number): void
  (e: 'toolModeChange', mode: MaskToolMode): void
  (e: 'clearMask'): void
}>()

const sections = reactive({
  mask: true,
  volume: true,
  info: false
})

function toggleSection(section: keyof typeof sections) {
  sections[section] = !sections[section]
}

function setToolMode(mode: MaskToolMode) {
  emit('toolModeChange', mode)
}

function clearMask() {
  emit('clearMask')
}

function onBrushRadiusChange(event: Event) {
  const target = event.target as HTMLInputElement
  emit('brushRadiusChange', parseFloat(target.value))
}

function onMaskOpacityChange(event: Event) {
  const target = event.target as HTMLInputElement
  emit('maskOpacityChange', parseFloat(target.value))
}

function onMaskEnabledChange(event: Event) {
  const target = event.target as HTMLInputElement
  emit('maskEnabledChange', target.checked)
}

function formatVolume(mm3: number): string {
  if (mm3 >= 1000) {
    return (mm3 / 1000).toFixed(2)
  }
  return mm3.toFixed(1)
}

function formatVolumeCm3(cm3: number): string {
  return cm3.toFixed(3)
}

function formatArea(mm2: number): string {
  return mm2.toFixed(1)
}
</script>

<style lang="scss" scoped>
.mask-panel {
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
    background: rgba(0, 200, 255, 0.04);
  }
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #a8b5c9;
}

.section-icon {
  color: #00c8ff;
}

.section-content {
  padding: 0 16px 16px;
}

.tool-buttons {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.tool-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  background: #1a202c;
  border: 1px solid #2a3345;
  border-radius: 8px;
  color: #7a8ba3;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #222a3a;
    border-color: #3a4560;
    color: #a8b5c9;
  }

  &.active {
    background: rgba(0, 200, 255, 0.12);
    border-color: #00c8ff;
    color: #00e5ff;
  }

  &.danger {
    &:hover {
      background: rgba(255, 80, 80, 0.1);
      border-color: #ff5050;
      color: #ff7070;
    }
  }
}

.control-group {
  margin-bottom: 14px;
}

.control-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;

  label {
    font-size: 12px;
    color: #7a8ba3;
  }
}

.value-badge {
  font-size: 11px;
  font-weight: 600;
  color: #00e5ff;
  background: rgba(0, 200, 255, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
}

.slider {
  width: 100%;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: #2a3345;
  border-radius: 2px;
  outline: none;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #5a6a85;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  &::-webkit-slider-thumb:hover {
    background: #7a8ba3;
  }

  &.accent-cyan::-webkit-slider-thumb {
    background: #00c8ff;
    box-shadow: 0 0 8px rgba(0, 200, 255, 0.5);

    &:hover {
      background: #00e5ff;
    }
  }
}

.toggle-row {
  margin-top: 8px;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 12px;
  color: #a8b5c9;

  input {
    display: none;
  }
}

.toggle-slider {
  position: relative;
  width: 36px;
  height: 20px;
  background: #2a3345;
  border-radius: 10px;
  transition: background 0.2s ease;

  &::before {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: #5a6a85;
    border-radius: 50%;
    transition: all 0.2s ease;
  }
}

.toggle-input:checked + .toggle-slider {
  background: rgba(0, 200, 255, 0.3);

  &::before {
    left: 18px;
    background: #00c8ff;
  }
}

.toggle-text {
  font-size: 12px;
}

.volume-stats {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stat-card {
  background: linear-gradient(135deg, rgba(0, 200, 255, 0.15), rgba(0, 150, 255, 0.08));
  border: 1px solid rgba(0, 200, 255, 0.3);
  border-radius: 10px;
  padding: 14px;
  text-align: center;

  &.primary {
    background: linear-gradient(135deg, rgba(0, 200, 255, 0.2), rgba(0, 150, 255, 0.12));
    border-color: rgba(0, 200, 255, 0.4);
  }
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #00e5ff;
  line-height: 1.2;

  &.small {
    font-size: 16px;
  }
}

.stat-unit {
  font-size: 11px;
  color: #7a8ba3;
  margin-top: 2px;
}

.stat-label {
  font-size: 11px;
  color: #5a6a85;
  margin-top: 4px;
}

.stat-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.stat-item {
  background: #1a202c;
  border: 1px solid #2a3345;
  border-radius: 8px;
  padding: 10px;
  text-align: center;

  &.full {
    grid-column: 1 / -1;
  }
}

.empty-stats {
  text-align: center;
  padding: 20px 0;
  color: #5a6a85;

  p {
    font-size: 12px;
    margin: 6px 0;

    &.hint {
      font-size: 11px;
      color: #4a5a72;
    }
  }
}

.empty-icon {
  opacity: 0.3;
  margin-bottom: 8px;
}

.sphere-list {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #2a3345;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #7a8ba3;
  font-weight: 600;
}

.count-badge {
  background: #2a3345;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  color: #a8b5c9;
}

.help-list {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 12px;
  color: #7a8ba3;

  li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
  }
}

kbd {
  display: inline-block;
  padding: 2px 6px;
  font-size: 10px;
  font-family: monospace;
  background: #1a202c;
  border: 1px solid #2a3345;
  border-radius: 4px;
  color: #a8b5c9;
  min-width: 60px;
  text-align: center;
}
</style>

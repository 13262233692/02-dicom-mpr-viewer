<template>
  <div class="toolbar">
    <div class="toolbar-left">
      <div class="app-logo">
        <Scan class="logo-icon" :size="20" />
        <span class="app-title">DICOM MPR Viewer</span>
      </div>
    </div>

    <div class="toolbar-center">
      <button class="toolbar-btn" @click="$emit('import')">
        <Upload :size="16" />
        <span>导入 DICOM</span>
      </button>
      <div class="toolbar-divider"></div>
      <button class="toolbar-btn" @click="$emit('reset')">
        <RotateCcw :size="16" />
        <span>重置视图</span>
      </button>
      <button class="toolbar-btn" @click="$emit('loadDemo')">
        <FileImage :size="16" />
        <span>加载示例</span>
      </button>
    </div>

    <div class="toolbar-right">
      <div class="layout-selector">
        <button
          v-for="layout in layouts"
          :key="layout.value"
          class="layout-btn"
          :class="{ active: currentLayout === layout.value }"
          @click="$emit('layoutChange', layout.value)"
          :title="layout.label"
        >
          <component :is="layout.icon" :size="16" />
        </button>
      </div>
    </div>

    <input
      ref="fileInput"
      type="file"
      multiple
      accept=".dcm"
      class="file-input"
      @change="handleFileChange"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, markRaw } from 'vue'
import { Upload, RotateCcw, FileImage, Grid3x3, LayoutGrid, Scan, Columns } from 'lucide-vue-next'

defineProps<{
  currentLayout: string
}>()

const emit = defineEmits<{
  (e: 'import'): void
  (e: 'reset'): void
  (e: 'loadDemo'): void
  (e: 'layoutChange', layout: string): void
  (e: 'filesSelected', files: FileList): void
}>()

const fileInput = ref<HTMLInputElement | null>(null)

const layouts = [
  { value: 'grid', label: '网格布局', icon: markRaw(Grid3x3) },
  { value: 'row', label: '水平排列', icon: markRaw(Columns) },
  { value: 'col', label: '垂直排列', icon: markRaw(LayoutGrid) }
]

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    emit('filesSelected', target.files)
    target.value = ''
  }
}

function triggerFileInput() {
  fileInput.value?.click()
}

defineExpose({
  triggerFileInput
})
</script>

<style lang="scss" scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 52px;
  background: #12171f;
  border-bottom: 1px solid #1e2430;
  position: relative;
}

.toolbar-left,
.toolbar-center,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.app-logo {
  display: flex;
  align-items: center;
  gap: 10px;

  .logo-icon {
    color: #00d4ff;
  }

  .app-title {
    font-size: 15px;
    font-weight: 600;
    color: #e0e6ed;
    letter-spacing: 0.3px;
  }
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  background: transparent;
  border: 1px solid #2a3444;
  border-radius: 6px;
  color: #8892a6;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #1a202c;
    border-color: #3a4558;
    color: #e0e6ed;
  }

  &:active {
    transform: scale(0.98);
  }
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: #2a3444;
  margin: 0 4px;
}

.layout-selector {
  display: flex;
  align-items: center;
  background: #0f131a;
  border: 1px solid #2a3444;
  border-radius: 6px;
  padding: 2px;
}

.layout-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    color: #8892a6;
    background: #1a202c;
  }

  &.active {
    background: #00d4ff;
    color: #0a0c10;
  }
}

.file-input {
  display: none;
}
</style>

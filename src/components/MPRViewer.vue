<template>
  <div class="mpr-viewer">
    <Toolbar
      ref="toolbarRef"
      :current-layout="layout"
      @import="handleImport"
      @reset="handleReset"
      @load-demo="loadDemoData"
      @layout-change="handleLayoutChange"
      @files-selected="handleFilesSelected"
    />

    <div class="viewer-main">
      <div
        class="viewports-container"
        :class="`layout-${layout}`"
      >
        <div
          v-for="plane in planes"
          :key="plane"
          class="viewport-wrapper"
          @click="setActiveView(plane)"
        >
          <ViewportPanel
            :ref="(el) => setViewportRef(plane, el)"
            :plane="plane"
            :volume-data="volumeData"
            :slice-index="sliceIndices[plane]"
            :window-width="windowWidth"
            :window-level="windowLevel"
            :active="activeView === plane"
            :mask-enabled="maskEnabled"
            :mask-opacity="maskOpacity"
            :brush-radius="brushRadius"
            :mask-tool-mode="maskToolMode"
            @slice-change="(idx) => onSliceChange(plane, idx)"
            @mask-changed="onMaskChanged"
          />
        </div>
      </div>

      <div class="side-panels">
        <ControlPanel
          :volume-data="volumeData"
          :slice-indices="sliceIndices"
          :window-width="windowWidth"
          :window-level="windowLevel"
          @slice-change="handleSliceChange"
          @window-change="handleWindowChange"
        />

        <MaskPanel
          :mask-enabled="maskEnabled"
          :mask-opacity="maskOpacity"
          :brush-radius="brushRadius"
          :tool-mode="maskToolMode"
          :volume-result="maskVolumeResult"
          :sphere-count="sphereCount"
          @mask-enabled-change="handleMaskEnabledChange"
          @mask-opacity-change="handleMaskOpacityChange"
          @brush-radius-change="handleBrushRadiusChange"
          @tool-mode-change="handleToolModeChange"
          @clear-mask="handleClearMask"
        />
      </div>
    </div>

    <StatusBar
      :volume-data="volumeData"
      :active-view="activeView"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import Toolbar from '@/components/Toolbar.vue'
import ViewportPanel from '@/components/ViewportPanel.vue'
import ControlPanel from '@/components/ControlPanel.vue'
import MaskPanel from '@/components/MaskPanel.vue'
import StatusBar from '@/components/StatusBar.vue'
import { generatePhantomVolume } from '@/volume/phantomData'
import { buildVolumeFromDICOMSlices, parseDICOMFiles } from '@/dicom/dicomParser'
import type { VolumeData, MPRPlane, MaskToolMode, MaskVolumeResult } from '@/types'

const toolbarRef = ref<InstanceType<typeof Toolbar> | null>(null)

const layout = ref<'grid' | 'row' | 'col'>('grid')
const activeView = ref<MPRPlane | null>(null)
const volumeData = ref<VolumeData | null>(null)
const isLoading = ref(false)

const viewportRefs = reactive<Record<string, InstanceType<typeof ViewportPanel> | null>>({
  axial: null,
  sagittal: null,
  coronal: null
})

const planes: MPRPlane[] = ['axial', 'sagittal', 'coronal']

const sliceIndices = reactive<Record<MPRPlane, number>>({
  axial: 0,
  sagittal: 0,
  coronal: 0
})

const windowWidth = ref(2000)
const windowLevel = ref(1000)

const maskEnabled = ref(true)
const maskOpacity = ref(0.85)
const brushRadius = ref(8)
const maskToolMode = ref<MaskToolMode>('none')
const maskVolumeResult = ref<MaskVolumeResult | null>(null)

const sphereCount = computed(() => {
  const firstViewport = viewportRefs.axial
  if (firstViewport) {
    const renderer = firstViewport.getRenderer?.()
    if (renderer) {
      const manager = renderer.getMaskManager()
      return manager.getSphereCount()
    }
  }
  return 0
})

function setViewportRef(plane: string, el: unknown) {
  viewportRefs[plane] = el as InstanceType<typeof ViewportPanel> | null
}

onMounted(() => {
  loadDemoData()
})

function loadDemoData() {
  isLoading.value = true
  setTimeout(() => {
    const phantom = generatePhantomVolume(256, 256, 128, { x: 1.0, y: 1.0, z: 2.0 })
    volumeData.value = phantom

    sliceIndices.axial = Math.floor(phantom.dimensions.depth / 2)
    sliceIndices.sagittal = Math.floor(phantom.dimensions.width / 2)
    sliceIndices.coronal = Math.floor(phantom.dimensions.height / 2)

    windowWidth.value = phantom.maxValue - phantom.minValue
    windowLevel.value = (phantom.maxValue + phantom.minValue) / 2

    isLoading.value = false
  }, 100)
}

async function handleFilesSelected(files: FileList) {
  isLoading.value = true
  try {
    const fileArray = Array.from(files)
    const slices = await parseDICOMFiles(fileArray)
    const volume = buildVolumeFromDICOMSlices(slices)
    volumeData.value = volume

    sliceIndices.axial = Math.floor(volume.dimensions.depth / 2)
    sliceIndices.sagittal = Math.floor(volume.dimensions.width / 2)
    sliceIndices.coronal = Math.floor(volume.dimensions.height / 2)

    windowWidth.value = volume.maxValue - volume.minValue
    windowLevel.value = (volume.maxValue + volume.minValue) / 2
  } catch (error) {
    console.error('DICOM 加载失败:', error)
    alert('DICOM 文件加载失败，请检查文件格式')
  } finally {
    isLoading.value = false
  }
}

function handleImport() {
  toolbarRef.value?.triggerFileInput()
}

function handleReset() {
  if (volumeData.value) {
    sliceIndices.axial = Math.floor(volumeData.value.dimensions.depth / 2)
    sliceIndices.sagittal = Math.floor(volumeData.value.dimensions.width / 2)
    sliceIndices.coronal = Math.floor(volumeData.value.dimensions.height / 2)
  }
}

function handleLayoutChange(newLayout: string) {
  layout.value = newLayout as 'grid' | 'row' | 'col'
}

function setActiveView(plane: MPRPlane) {
  activeView.value = plane
}

function onSliceChange(plane: MPRPlane, index: number) {
  sliceIndices[plane] = index
}

function handleSliceChange(plane: MPRPlane, index: number) {
  sliceIndices[plane] = index
}

function handleWindowChange(width: number, level: number) {
  windowWidth.value = width
  windowLevel.value = level
}

function handleMaskEnabledChange(enabled: boolean) {
  maskEnabled.value = enabled
}

function handleMaskOpacityChange(opacity: number) {
  maskOpacity.value = opacity
}

function handleBrushRadiusChange(radius: number) {
  brushRadius.value = radius
}

function handleToolModeChange(mode: MaskToolMode) {
  maskToolMode.value = mode
}

function handleClearMask() {
  planes.forEach(plane => {
    const viewport = viewportRefs[plane]
    if (viewport) {
      const renderer = viewport.getRenderer?.()
      if (renderer) {
        renderer.clearMask()
      }
    }
  })
  updateVolumeResult()
}

function onMaskChanged() {
  syncMaskAcrossViewports()
  updateVolumeResult()
}

function syncMaskAcrossViewports() {
  const sourceViewport = viewportRefs[activeView.value || 'axial']
  if (!sourceViewport) return

  const sourceRenderer = sourceViewport.getRenderer?.()
  if (!sourceRenderer) return

  const sourceManager = sourceRenderer.getMaskManager()
  const spheres = sourceManager.getSpheres()

  planes.forEach(plane => {
    if (plane === activeView.value) return

    const targetViewport = viewportRefs[plane]
    if (targetViewport) {
      const targetRenderer = targetViewport.getRenderer?.()
      if (targetRenderer) {
        const targetManager = targetRenderer.getMaskManager()
        targetManager.setSpheres(spheres)
      }
    }
  })
}

function updateVolumeResult() {
  const viewport = viewportRefs.axial || viewportRefs.sagittal || viewportRefs.coronal
  if (viewport) {
    const renderer = viewport.getRenderer?.()
    if (renderer) {
      const manager = renderer.getMaskManager()
      maskVolumeResult.value = manager.calculateTotalVolume()
    }
  }
}
</script>

<style lang="scss" scoped>
.mpr-viewer {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  background: #0a0c10;
  overflow: hidden;
}

.viewer-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.viewports-container {
  flex: 1;
  display: grid;
  gap: 8px;
  padding: 8px;
  background: #0a0c10;

  &.layout-grid {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;

    .viewport-wrapper:nth-child(1) {
      grid-column: 1 / 2;
      grid-row: 1 / 2;
    }

    .viewport-wrapper:nth-child(2) {
      grid-column: 2 / 3;
      grid-row: 1 / 2;
    }

    .viewport-wrapper:nth-child(3) {
      grid-column: 1 / 3;
      grid-row: 2 / 3;
    }
  }

  &.layout-row {
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: 1fr;
  }

  &.layout-col {
    grid-template-columns: 1fr;
    grid-template-rows: repeat(3, 1fr);
  }
}

.viewport-wrapper {
  position: relative;
  min-height: 0;
  min-width: 0;
}

.side-panels {
  display: flex;
  flex-direction: column;
  max-height: 100%;
  overflow-y: auto;
  overflow-x: hidden;

  > :deep(*) {
    flex-shrink: 0;
  }
}
</style>

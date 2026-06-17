import * as THREE from 'three'
import type { VolumeData, MPRPlane, MPRViewState, ViewportSize, SphereMask, MaskToolMode } from '@/types'
import { DoubleBufferManager } from '@/concurrency/DoubleBufferManager'
import { TaskScheduler, debounceWithPriority, TASK_PRIORITY_HIGH, TASK_PRIORITY_CRITICAL } from '@/concurrency/TaskScheduler'
import { MaskManager } from '@/mask/MaskManager'
import vertexShader from './shaders/volume.vert?raw'
import fragmentShader from './shaders/volume.frag?raw'

const TEXTURE_UPDATE_DEBOUNCE_MS = 16
const VOLUME_VALUE_SCALE = 4095.0
const DEFAULT_MASK_OPACITY = 0.85
const DEFAULT_BRUSH_RADIUS = 5.0

export class VolumeRenderer {
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  private renderer: THREE.WebGLRenderer
  private volumeTexture: THREE.Data3DTexture | null = null
  private maskTexture: THREE.Data3DTexture | null = null
  private planeMesh: THREE.Mesh | null = null
  private material: THREE.ShaderMaterial | null = null
  private volumeData: VolumeData | null = null
  private container: HTMLElement
  private viewState: MPRViewState
  private needsRender: boolean = true
  private animationFrameId: number | null = null
  private isDragging: boolean = false
  private lastMousePos: { x: number; y: number } = { x: 0, y: 0 }

  private doubleBuffer: DoubleBufferManager | null = null
  private lastFrameCounter: number = -1
  private textureUploadScheduler: TaskScheduler
  private textureNeedsUpdate: boolean = false
  private currentFrameToken: number = 0
  private lastUploadedFrame: number = -1

  private pendingWindowWidth: number | null = null
  private pendingWindowLevel: number | null = null

  private maskManager: MaskManager
  private maskEnabled: boolean = false
  private maskOpacity: number = DEFAULT_MASK_OPACITY
  private brushRadius: number = DEFAULT_BRUSH_RADIUS
  private maskToolMode: MaskToolMode = 'none'
  private isBrushDrawing: boolean = false
  private maskTextureDirty: boolean = false
  private onMaskChangedCallback: (() => void) | null = null

  constructor(container: HTMLElement, plane: MPRPlane) {
    this.container = container
    this.viewState = {
      plane,
      sliceIndex: 0.5,
      windowWidth: 2000,
      windowLevel: 1000,
      zoom: 1.0,
      pan: { x: 0, y: 0 }
    }

    this.textureUploadScheduler = new TaskScheduler(1)
    this.maskManager = new MaskManager()

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x0f1218)

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000)
    this.camera.position.z = 2

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: false
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace

    container.appendChild(this.renderer.domElement)

    this.setupEventListeners()
    this.animate()
  }

  private setupEventListeners(): void {
    const canvas = this.renderer.domElement

    canvas.addEventListener('wheel', this.handleWheel.bind(this), { passive: false })
    canvas.addEventListener('mousedown', this.handleMouseDown.bind(this))
    window.addEventListener('mousemove', this.handleMouseMove.bind(this))
    window.addEventListener('mouseup', this.handleMouseUp.bind(this))
    canvas.addEventListener('dblclick', this.handleDoubleClick.bind(this))
    canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this))
  }

  private handleWheel(event: WheelEvent): void {
    if (this.maskToolMode === 'draw' || this.maskToolMode === 'erase') {
      event.preventDefault()
      const delta = event.deltaY > 0 ? 0.9 : 1.1
      this.brushRadius = Math.max(1, Math.min(50, this.brushRadius * delta))
      this.needsRender = true
      return
    }

    event.preventDefault()
    const delta = event.deltaY > 0 ? 0.9 : 1.1
    this.viewState.zoom = Math.max(0.1, Math.min(10, this.viewState.zoom * delta))
    this.updateMaterialUniforms()
    this.needsRender = true
  }

  private handleMouseDown(event: MouseEvent): void {
    if (event.button === 0) {
      if (this.maskToolMode === 'draw' || this.maskToolMode === 'erase') {
        this.isBrushDrawing = true
        this.applyBrushAtMouse(event.clientX, event.clientY)
        return
      }

      this.isDragging = true
      this.lastMousePos = { x: event.clientX, y: event.clientY }
    }
  }

  private handleMouseMove(event: MouseEvent): void {
    if (this.isBrushDrawing && (this.maskToolMode === 'draw' || this.maskToolMode === 'erase')) {
      this.applyBrushAtMouse(event.clientX, event.clientY)
      return
    }

    if (this.isDragging) {
      const dx = event.clientX - this.lastMousePos.x
      const dy = event.clientY - this.lastMousePos.y

      const panSpeed = 2 / this.viewState.zoom

      this.viewState.pan.x += (dx / this.renderer.domElement.clientWidth) * panSpeed
      this.viewState.pan.y -= (dy / this.renderer.domElement.clientHeight) * panSpeed

      this.lastMousePos = { x: event.clientX, y: event.clientY }
      this.updateMaterialUniforms()
      this.needsRender = true
    }
  }

  private handleMouseUp(): void {
    if (this.isBrushDrawing) {
      this.isBrushDrawing = false
      return
    }
    this.isDragging = false
  }

  private handleMouseLeave(): void {
    this.isBrushDrawing = false
  }

  private handleDoubleClick(): void {
    this.viewState.zoom = 1.0
    this.viewState.pan = { x: 0, y: 0 }
    this.updateMaterialUniforms()
    this.needsRender = true
  }

  private applyBrushAtMouse(clientX: number, clientY: number): void {
    if (!this.volumeData) return

    const rect = this.renderer.domElement.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * 2 - 1
    const y = -(((clientY - rect.top) / rect.height) * 2 - 1)

    const sphereParams = this.maskManager.screenToWorldSphere(
      this.viewState.plane,
      this.getSliceIndex(),
      x,
      y,
      this.brushRadius,
      this.viewState.zoom,
      this.viewState.pan
    )

    if (!sphereParams) return

    if (this.maskToolMode === 'draw') {
      this.maskManager.addSphere(
        sphereParams.centerX,
        sphereParams.centerY,
        sphereParams.centerZ,
        sphereParams.radius
      )
    } else if (this.maskToolMode === 'erase') {
    }

    this.maskTextureDirty = true
    this.needsRender = true

    if (this.onMaskChangedCallback) {
      this.onMaskChangedCallback()
    }
  }

  setVolumeData(volumeData: VolumeData): void {
    this.volumeData = volumeData
    this.maskManager.setVolumeData(volumeData)

    if (this.volumeTexture) {
      this.volumeTexture.dispose()
      this.volumeTexture = null
    }

    if (this.maskTexture) {
      this.maskTexture.dispose()
      this.maskTexture = null
    }

    const { width, height, depth } = volumeData.dimensions
    const voxelCount = width * height * depth
    const voxelData = volumeData.voxelData

    const useSharedBuffer = typeof SharedArrayBuffer !== 'undefined'

    if (useSharedBuffer) {
      try {
        this.doubleBuffer = new DoubleBufferManager(voxelCount, 1)

        const normalizedData = new Uint8Array(voxelCount)
        const minVal = volumeData.minValue
        const maxVal = volumeData.maxValue
        const range = maxVal - minVal > 0 ? maxVal - minVal : 1

        for (let i = 0; i < voxelData.length && i < voxelCount; i++) {
          normalizedData[i] = Math.floor(((voxelData[i] - minVal) / range) * 255)
        }

        this.doubleBuffer.writeToBackBuffer(normalizedData, false)
        this.lastFrameCounter = this.doubleBuffer.getFrameCounter()

        const frontBuffer = this.doubleBuffer.getFrontBufferForReadBlocking()
        this.volumeTexture = this.create3DTexture(frontBuffer, width, height, depth)
        this.lastUploadedFrame = this.lastFrameCounter
      } catch (e) {
        console.warn('SharedArrayBuffer 初始化失败，回退到普通缓冲区:', e)
        this.doubleBuffer = null
        this.volumeTexture = this.create3DTextureFromVolume(volumeData)
      }
    } else {
      this.doubleBuffer = null
      this.volumeTexture = this.create3DTextureFromVolume(volumeData)
    }

    this.createMaskTexture(width, height, depth)

    this.viewState.windowLevel = (volumeData.minValue + volumeData.maxValue) / 2
    this.viewState.windowWidth = volumeData.maxValue - volumeData.minValue

    if (this.viewState.windowWidth <= 0) {
      this.viewState.windowWidth = 100
    }

    this.createPlaneMesh()
    this.updateMaterialUniforms()
    this.needsRender = true
  }

  private create3DTexture(data: Uint8Array, width: number, height: number, depth: number): THREE.Data3DTexture {
    const textureData = new Uint8Array(data)

    const texture = new THREE.Data3DTexture(textureData, width, height, depth)
    texture.format = THREE.RedFormat
    texture.type = THREE.UnsignedByteType
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    texture.wrapR = THREE.ClampToEdgeWrapping
    texture.needsUpdate = true
    texture.unpackAlignment = 1

    return texture
  }

  private create3DTextureFromVolume(volumeData: VolumeData): THREE.Data3DTexture {
    const { width, height, depth } = volumeData.dimensions
    const voxelData = volumeData.voxelData
    const data = new Uint8Array(width * height * depth)

    const minVal = volumeData.minValue
    const maxVal = volumeData.maxValue
    const range = maxVal - minVal > 0 ? maxVal - minVal : 1

    for (let i = 0; i < voxelData.length; i++) {
      data[i] = Math.floor(((voxelData[i] - minVal) / range) * 255)
    }

    return this.create3DTexture(data, width, height, depth)
  }

  private createMaskTexture(width: number, height: number, depth: number): void {
    const maskData = new Uint8Array(width * height * depth)

    this.maskTexture = new THREE.Data3DTexture(maskData, width, height, depth)
    this.maskTexture.format = THREE.RedFormat
    this.maskTexture.type = THREE.UnsignedByteType
    this.maskTexture.minFilter = THREE.LinearFilter
    this.maskTexture.magFilter = THREE.LinearFilter
    this.maskTexture.wrapS = THREE.ClampToEdgeWrapping
    this.maskTexture.wrapT = THREE.ClampToEdgeWrapping
    this.maskTexture.wrapR = THREE.ClampToEdgeWrapping
    this.maskTexture.needsUpdate = true
    this.maskTexture.unpackAlignment = 1
  }

  private updateMaskTexture(): void {
    if (!this.maskTexture) return

    const maskData = this.maskManager.getMaskTextureData()
    if (!maskData) return

    const textureImage = this.maskTexture.image
    if (textureImage && textureImage.data) {
      const dstData = textureImage.data as unknown as Uint8Array
      dstData.set(maskData)
    }

    this.maskTexture.needsUpdate = true
    this.maskTextureDirty = false
  }

  private createPlaneMesh(): void {
    if (this.planeMesh) {
      this.scene.remove(this.planeMesh)
      this.planeMesh.geometry.dispose()
      if (this.material) {
        this.material.dispose()
      }
    }

    const geometry = new THREE.PlaneGeometry(2, 2)
    const planeType = this.getPlaneTypeInt()

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        u_volumeTexture: { value: this.volumeTexture },
        u_maskTexture: { value: this.maskTexture },
        u_volumeDimensions: { value: new THREE.Vector3(
          this.volumeData?.dimensions.width || 0,
          this.volumeData?.dimensions.height || 0,
          this.volumeData?.dimensions.depth || 0
        )},
        u_volumeSpacing: { value: new THREE.Vector3(
          this.volumeData?.spacing.x || 1,
          this.volumeData?.spacing.y || 1,
          this.volumeData?.spacing.z || 1
        )},
        u_windowWidth: { value: this.viewState.windowWidth },
        u_windowLevel: { value: this.viewState.windowLevel },
        u_planeType: { value: planeType },
        u_slicePosition: { value: this.viewState.sliceIndex },
        u_zoom: { value: this.viewState.zoom },
        u_pan: { value: new THREE.Vector2(this.viewState.pan.x, this.viewState.pan.y) },
        u_minValue: { value: this.volumeData?.minValue || 0 },
        u_maxValue: { value: this.volumeData?.maxValue || 0 },
        u_valueScale: { value: VOLUME_VALUE_SCALE },
        u_frameToken: { value: 0.0 },
        u_maskEnabled: { value: this.maskEnabled ? 1 : 0 },
        u_maskOpacity: { value: this.maskOpacity }
      },
      depthTest: false,
      depthWrite: false
    })

    this.planeMesh = new THREE.Mesh(geometry, this.material)
    this.scene.add(this.planeMesh)
  }

  private getPlaneTypeInt(): number {
    switch (this.viewState.plane) {
      case 'axial': return 0
      case 'sagittal': return 1
      case 'coronal': return 2
      default: return 0
    }
  }

  private updateMaterialUniforms(): void {
    if (!this.material) return

    this.material.uniforms.u_slicePosition.value = this.viewState.sliceIndex
    this.material.uniforms.u_windowWidth.value = this.viewState.windowWidth
    this.material.uniforms.u_windowLevel.value = this.viewState.windowLevel
    this.material.uniforms.u_zoom.value = this.viewState.zoom
    this.material.uniforms.u_pan.value.set(this.viewState.pan.x, this.viewState.pan.y)
    this.material.uniforms.u_maskEnabled.value = this.maskEnabled ? 1 : 0
    this.material.uniforms.u_maskOpacity.value = this.maskOpacity
  }

  private scheduleTextureUpdate = debounceWithPriority(
    async () => {
      if (!this.doubleBuffer || !this.volumeTexture || !this.material) {
        return
      }

      const currentFrame = this.doubleBuffer.getFrameCounter()
      if (currentFrame === this.lastUploadedFrame) {
        return
      }

      const frameToken = ++this.currentFrameToken
      const frontBuffer = this.doubleBuffer.getFrontBufferForRead()

      if (!frontBuffer) {
        return
      }

      await this.textureUploadScheduler.schedule(async () => {
        if (frameToken !== this.currentFrameToken) {
          return
        }

        if (!this.volumeTexture || !this.material) {
          return
        }

        const textureImage = this.volumeTexture.image
        if (textureImage && textureImage.data) {
          const dstData = textureImage.data as unknown as Uint8Array
          dstData.set(frontBuffer)
        }

        this.volumeTexture.needsUpdate = true
        this.material.uniforms.u_frameToken.value = frameToken

        this.lastUploadedFrame = currentFrame
        this.needsRender = true
      }, TASK_PRIORITY_HIGH)
    },
    TEXTURE_UPDATE_DEBOUNCE_MS,
    new TaskScheduler(1),
    TASK_PRIORITY_CRITICAL
  )

  setSliceIndex(index: number): void {
    const maxIndex = this.getMaxSliceIndex()
    this.viewState.sliceIndex = Math.max(0, Math.min(1, index / maxIndex))
    this.updateMaterialUniforms()
    this.needsRender = true
  }

  getSliceIndex(): number {
    const maxIndex = this.getMaxSliceIndex()
    return Math.round(this.viewState.sliceIndex * maxIndex)
  }

  getMaxSliceIndex(): number {
    if (!this.volumeData) return 1

    switch (this.viewState.plane) {
      case 'axial': return this.volumeData.dimensions.depth - 1
      case 'sagittal': return this.volumeData.dimensions.width - 1
      case 'coronal': return this.volumeData.dimensions.height - 1
      default: return 1
    }
  }

  setWindowLevel(windowWidth: number, windowLevel: number): void {
    this.pendingWindowWidth = windowWidth
    this.pendingWindowLevel = windowLevel

    this.viewState.windowWidth = windowWidth
    this.viewState.windowLevel = windowLevel
    this.updateMaterialUniforms()
    this.needsRender = true
  }

  getViewState(): MPRViewState {
    return { ...this.viewState }
  }

  setViewState(state: Partial<MPRViewState>): void {
    Object.assign(this.viewState, state)
    this.updateMaterialUniforms()
    this.needsRender = true
  }

  setMaskEnabled(enabled: boolean): void {
    this.maskEnabled = enabled
    this.updateMaterialUniforms()
    this.needsRender = true
  }

  getMaskEnabled(): boolean {
    return this.maskEnabled
  }

  setMaskOpacity(opacity: number): void {
    this.maskOpacity = Math.max(0, Math.min(1, opacity))
    this.updateMaterialUniforms()
    this.needsRender = true
  }

  setBrushRadius(radius: number): void {
    this.brushRadius = Math.max(1, Math.min(100, radius))
    this.needsRender = true
  }

  getBrushRadius(): number {
    return this.brushRadius
  }

  setMaskToolMode(mode: MaskToolMode): void {
    this.maskToolMode = mode

    const canvas = this.renderer.domElement
    if (mode === 'draw' || mode === 'erase') {
      canvas.style.cursor = 'crosshair'
    } else {
      canvas.style.cursor = 'grab'
    }
  }

  getMaskToolMode(): MaskToolMode {
    return this.maskToolMode
  }

  getMaskManager(): MaskManager {
    return this.maskManager
  }

  clearMask(): void {
    this.maskManager.clearAllSpheres()
    this.maskTextureDirty = true
    this.needsRender = true

    if (this.onMaskChangedCallback) {
      this.onMaskChangedCallback()
    }
  }

  setOnMaskChanged(callback: (() => void) | null): void {
    this.onMaskChangedCallback = callback
  }

  getDoubleBuffer(): DoubleBufferManager | null {
    return this.doubleBuffer
  }

  requestTextureUpdate(): void {
    if (this.doubleBuffer) {
      const currentFrame = this.doubleBuffer.getFrameCounter()
      if (currentFrame !== this.lastFrameCounter) {
        this.lastFrameCounter = currentFrame
        this.textureNeedsUpdate = true
      }
    }
  }

  resize(): void {
    const width = this.container.clientWidth
    const height = this.container.clientHeight

    this.renderer.setSize(width, height)

    const aspect = width / height

    this.camera.left = -aspect
    this.camera.right = aspect
    this.camera.top = 1
    this.camera.bottom = -1
    this.camera.updateProjectionMatrix()

    this.needsRender = true
  }

  private animate(): void {
    this.animationFrameId = requestAnimationFrame(this.animate.bind(this))

    this.requestTextureUpdate()
    if (this.textureNeedsUpdate && this.doubleBuffer) {
      this.textureNeedsUpdate = false
      void this.scheduleTextureUpdate()
    }

    if (this.maskTextureDirty && this.maskEnabled) {
      this.updateMaskTexture()
    }

    if (this.needsRender) {
      this.render()
      this.needsRender = false
    }
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  getViewportSize(): ViewportSize {
    return {
      width: this.renderer.domElement.clientWidth,
      height: this.renderer.domElement.clientHeight
    }
  }

  dispose(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
    }

    if (this.volumeTexture) {
      this.volumeTexture.dispose()
    }

    if (this.maskTexture) {
      this.maskTexture.dispose()
    }

    if (this.doubleBuffer) {
      this.doubleBuffer.dispose()
    }

    if (this.planeMesh) {
      this.scene.remove(this.planeMesh)
      this.planeMesh.geometry.dispose()
      if (this.material) {
        this.material.dispose()
      }
    }

    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }
}

import * as THREE from 'three'
import type { VolumeData, MPRPlane, MPRViewState, ViewportSize } from '@/types'
import { DoubleBufferManager } from '@/concurrency/DoubleBufferManager'
import { TaskScheduler, debounceWithPriority, TASK_PRIORITY_HIGH, TASK_PRIORITY_CRITICAL } from '@/concurrency/TaskScheduler'
import vertexShader from './shaders/volume.vert?raw'
import fragmentShader from './shaders/volume.frag?raw'

const TEXTURE_UPDATE_DEBOUNCE_MS = 16
const VOLUME_VALUE_SCALE = 4095.0

export class VolumeRenderer {
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  private renderer: THREE.WebGLRenderer
  private volumeTexture: THREE.Data3DTexture | null = null
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
  }

  private handleWheel(event: WheelEvent): void {
    event.preventDefault()
    const delta = event.deltaY > 0 ? 0.9 : 1.1
    this.viewState.zoom = Math.max(0.1, Math.min(10, this.viewState.zoom * delta))
    this.updateMaterialUniforms()
    this.needsRender = true
  }

  private handleMouseDown(event: MouseEvent): void {
    if (event.button === 0) {
      this.isDragging = true
      this.lastMousePos = { x: event.clientX, y: event.clientY }
    }
  }

  private handleMouseMove(event: MouseEvent): void {
    if (this.isDragging) {
      const dx = event.clientX - this.lastMousePos.x
      const dy = event.clientY - this.lastMousePos.y

      const aspect = this.renderer.domElement.clientWidth / this.renderer.domElement.clientHeight
      const panSpeed = 2 / this.viewState.zoom

      this.viewState.pan.x += (dx / this.renderer.domElement.clientWidth) * panSpeed
      this.viewState.pan.y -= (dy / this.renderer.domElement.clientHeight) * panSpeed

      this.lastMousePos = { x: event.clientX, y: event.clientY }
      this.updateMaterialUniforms()
      this.needsRender = true
    }
  }

  private handleMouseUp(): void {
    this.isDragging = false
  }

  private handleDoubleClick(): void {
    this.viewState.zoom = 1.0
    this.viewState.pan = { x: 0, y: 0 }
    this.updateMaterialUniforms()
    this.needsRender = true
  }

  setVolumeData(volumeData: VolumeData): void {
    this.volumeData = volumeData

    if (this.volumeTexture) {
      this.volumeTexture.dispose()
      this.volumeTexture = null
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
        u_frameToken: { value: 0.0 }
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

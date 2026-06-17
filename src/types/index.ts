export interface VolumeDimensions {
  width: number
  height: number
  depth: number
}

export interface VolumeSpacing {
  x: number
  y: number
  z: number
}

export interface DICOMMetadata {
  patientName: string
  patientId: string
  studyDate: string
  studyTime: string
  modality: string
  studyDescription: string
  seriesDescription: string
  seriesNumber: number
  instanceNumber: number
  sliceThickness: number
  sliceLocation: number
  imagePositionPatient: number[]
  imageOrientationPatient: number[]
  pixelSpacing: number[]
  rows: number
  columns: number
  bitsAllocated: number
  bitsStored: number
  highBit: number
  pixelRepresentation: number
  windowCenter: number
  windowWidth: number
  rescaleSlope: number
  rescaleIntercept: number
}

export interface DICOMSlice {
  metadata: DICOMMetadata
  pixelData: Uint16Array | Float32Array
}

export interface VolumeData {
  dimensions: VolumeDimensions
  spacing: VolumeSpacing
  voxelData: Uint16Array | Float32Array
  metadata: DICOMMetadata | null
  minValue: number
  maxValue: number
}

export type MPRPlane = 'axial' | 'sagittal' | 'coronal'

export interface MPRViewState {
  plane: MPRPlane
  sliceIndex: number
  windowWidth: number
  windowLevel: number
  zoom: number
  pan: { x: number; y: number }
}

export interface ViewportSize {
  width: number
  height: number
}

import dicomParser from 'dicom-parser'
import type { DICOMMetadata, DICOMSlice, VolumeData, VolumeSpacing } from '@/types'
import { buildVolumeFromSlices } from '@/volume/VolumeBuilder'

function getElementValue(dataSet: any, tag: string, index: number = 0): any {
  const element = dataSet.elements[tag]
  if (!element) return undefined

  if (element.vr === 'US' || element.vr === 'SS') {
    return dataSet.uint16(tag, index)
  } else if (element.vr === 'UL' || element.vr === 'SL') {
    return dataSet.uint32(tag, index)
  } else if (element.vr === 'FL' || element.vr === 'FD') {
    return dataSet.float(tag, index)
  } else if (element.vr === 'DS') {
    const str = dataSet.string(tag, index)
    return str ? parseFloat(str) : undefined
  } else if (element.vr === 'IS') {
    const str = dataSet.string(tag, index)
    return str ? parseInt(str, 10) : undefined
  } else {
    return dataSet.string(tag, index)
  }
}

function getElementString(dataSet: any, tag: string): string {
  const value = dataSet.string(tag)
  return value || ''
}

function getElementArray(dataSet: any, tag: string, count: number): number[] {
  const element = dataSet.elements[tag]
  if (!element) return new Array(count).fill(0)

  const result: number[] = []
  for (let i = 0; i < count; i++) {
    if (element.vr === 'DS') {
      const str = dataSet.string(tag, i)
      result.push(str ? parseFloat(str) : 0)
    } else if (element.vr === 'US' || element.vr === 'SS') {
      result.push(dataSet.uint16(tag, i) || 0)
    } else if (element.vr === 'FL' || element.vr === 'FD') {
      result.push(dataSet.float(tag, i) || 0)
    } else {
      result.push(0)
    }
  }
  return result
}

export function parseDICOMFile(buffer: ArrayBuffer): DICOMSlice {
  const byteArray = new Uint8Array(buffer)

  let dataSet: any
  try {
    dataSet = dicomParser.parseDicom(byteArray)
  } catch (e) {
    throw new Error(`DICOM 解析失败: ${e}`)
  }

  const rows = getElementValue(dataSet, 'x00280010') || 0
  const columns = getElementValue(dataSet, 'x00280011') || 0
  const bitsAllocated = getElementValue(dataSet, 'x00280100') || 16
  const bitsStored = getElementValue(dataSet, 'x00280101') || 12
  const highBit = getElementValue(dataSet, 'x00280102') || 11
  const pixelRepresentation = getElementValue(dataSet, 'x00280103') || 0
  const rescaleSlope = getElementValue(dataSet, 'x00281053') || 1
  const rescaleIntercept = getElementValue(dataSet, 'x00281052') || 0

  let windowCenter = getElementValue(dataSet, 'x00281050') || 0
  let windowWidth = getElementValue(dataSet, 'x00281051') || 0

  if (!windowCenter || !windowWidth) {
    windowCenter = 40
    windowWidth = 400
  }

  const pixelSpacing = getElementArray(dataSet, 'x00280030', 2)
  const imagePositionPatient = getElementArray(dataSet, 'x00200032', 3)
  const imageOrientationPatient = getElementArray(dataSet, 'x00200037', 6)
  const sliceThickness = getElementValue(dataSet, 'x00180050') || 1
  const sliceLocation = getElementValue(dataSet, 'x00201041') || 0

  const pixelDataElement = dataSet.elements.x7fe00010
  let pixelData: Uint16Array

  if (pixelDataElement) {
    const pixelDataOffset = pixelDataElement.dataOffset
    if (bitsAllocated === 16) {
      pixelData = new Uint16Array(byteArray.buffer, byteArray.byteOffset + pixelDataOffset, rows * columns)
    } else if (bitsAllocated === 8) {
      const uint8Data = new Uint8Array(byteArray.buffer, byteArray.byteOffset + pixelDataOffset, rows * columns)
      pixelData = new Uint16Array(rows * columns)
      for (let i = 0; i < uint8Data.length; i++) {
        pixelData[i] = uint8Data[i]
      }
    } else {
      pixelData = new Uint16Array(rows * columns)
    }

    if (pixelRepresentation === 1) {
      const signedData = new Int16Array(pixelData.buffer)
      const unsignedData = new Uint16Array(rows * columns)
      for (let i = 0; i < signedData.length; i++) {
        unsignedData[i] = signedData[i] + 32768
      }
      pixelData = unsignedData
    }
  } else {
    pixelData = new Uint16Array(rows * columns)
  }

  const metadata: DICOMMetadata = {
    patientName: getElementString(dataSet, 'x00100010'),
    patientId: getElementString(dataSet, 'x00100020'),
    studyDate: getElementString(dataSet, 'x00080020'),
    studyTime: getElementString(dataSet, 'x00080030'),
    modality: getElementString(dataSet, 'x00080060'),
    studyDescription: getElementString(dataSet, 'x00081030'),
    seriesDescription: getElementString(dataSet, 'x0008103e'),
    seriesNumber: getElementValue(dataSet, 'x00200011') || 0,
    instanceNumber: getElementValue(dataSet, 'x00200013') || 0,
    sliceThickness,
    sliceLocation,
    imagePositionPatient,
    imageOrientationPatient,
    pixelSpacing,
    rows,
    columns,
    bitsAllocated,
    bitsStored,
    highBit,
    pixelRepresentation,
    windowCenter,
    windowWidth,
    rescaleSlope,
    rescaleIntercept
  }

  return {
    metadata,
    pixelData
  }
}

export function parseDICOMFiles(files: File[]): Promise<DICOMSlice[]> {
  return Promise.all(
    files.map(file =>
      file.arrayBuffer().then(buffer => parseDICOMFile(buffer))
    )
  )
}

export function sortSlicesByPosition(slices: DICOMSlice[]): DICOMSlice[] {
  return [...slices].sort((a, b) => {
    const posA = a.metadata.imagePositionPatient[2] || a.metadata.sliceLocation || a.metadata.instanceNumber
    const posB = b.metadata.imagePositionPatient[2] || b.metadata.sliceLocation || b.metadata.instanceNumber
    return posA - posB
  })
}

export function buildVolumeFromDICOMSlices(slices: DICOMSlice[]): VolumeData {
  if (slices.length === 0) {
    throw new Error('没有 DICOM 切片数据')
  }

  const sortedSlices = sortSlicesByPosition(slices)
  const firstSlice = sortedSlices[0]
  const width = firstSlice.metadata.columns
  const height = firstSlice.metadata.rows
  const depth = sortedSlices.length

  const pixelSpacing = firstSlice.metadata.pixelSpacing
  const sliceSpacing = calculateSliceSpacing(sortedSlices)

  const spacing: VolumeSpacing = {
    x: pixelSpacing[0] || 1.0,
    y: pixelSpacing[1] || 1.0,
    z: sliceSpacing
  }

  const pixelDataArray = sortedSlices.map(slice => slice.pixelData)

  const volumeData = buildVolumeFromSlices(pixelDataArray, width, height, spacing)

  volumeData.metadata = firstSlice.metadata

  return volumeData
}

function calculateSliceSpacing(slices: DICOMSlice[]): number {
  if (slices.length < 2) {
    return slices[0]?.metadata.sliceThickness || 1.0
  }

  const firstPos = slices[0].metadata.imagePositionPatient[2]
  const secondPos = slices[1].metadata.imagePositionPatient[2]

  if (firstPos !== undefined && secondPos !== undefined && firstPos !== secondPos) {
    return Math.abs(secondPos - firstPos)
  }

  return slices[0]?.metadata.sliceThickness || 1.0
}

#include "VolumeBuilder.h"
#include <cstring>
#include <cmath>
#include <algorithm>

VolumeBuilder::VolumeBuilder(int width, int height, int depth)
    : m_width(width)
    , m_height(height)
    , m_depth(depth)
    , m_spacingX(1.0f)
    , m_spacingY(1.0f)
    , m_spacingZ(1.0f)
    , m_built(false)
    , m_minValue(UINT16_MAX)
    , m_maxValue(0)
{
    m_voxelData.resize(static_cast<size_t>(width) * height * depth, 0);
}

VolumeBuilder::~VolumeBuilder() = default;

void VolumeBuilder::setSpacing(float sx, float sy, float sz) {
    m_spacingX = sx;
    m_spacingY = sy;
    m_spacingZ = sz;
}

bool VolumeBuilder::addSlice(int zIndex, const uint16_t* sliceData, int sliceSize) {
    if (zIndex < 0 || zIndex >= m_depth) {
        return false;
    }

    int expectedSize = m_width * m_height;
    if (sliceSize != expectedSize) {
        return false;
    }

    size_t offset = static_cast<size_t>(zIndex) * m_width * m_height;
    std::memcpy(m_voxelData.data() + offset, sliceData, static_cast<size_t>(sliceSize) * sizeof(uint16_t));

    return true;
}

bool VolumeBuilder::buildVolume() {
    m_minValue = UINT16_MAX;
    m_maxValue = 0;

    for (size_t i = 0; i < m_voxelData.size(); ++i) {
        uint16_t value = m_voxelData[i];
        if (value < m_minValue) m_minValue = value;
        if (value > m_maxValue) m_maxValue = value;
    }

    if (m_minValue > m_maxValue) {
        m_minValue = 0;
        m_maxValue = 0;
    }

    m_built = true;
    return true;
}

uint16_t* VolumeBuilder::getVoxelData() const {
    return const_cast<uint16_t*>(m_voxelData.data());
}

bool VolumeBuilder::isValidCoordinate(int x, int y, int z) const {
    return x >= 0 && x < m_width && y >= 0 && y < m_height && z >= 0 && z < m_depth;
}

uint16_t VolumeBuilder::getVoxel(int x, int y, int z) const {
    if (!isValidCoordinate(x, y, z)) {
        return 0;
    }
    size_t index = static_cast<size_t>(z) * m_width * m_height +
                   static_cast<size_t>(y) * m_width +
                   static_cast<size_t>(x);
    return m_voxelData[index];
}

float VolumeBuilder::lerp(float a, float b, float t) {
    return a + (b - a) * t;
}

uint16_t VolumeBuilder::clampVoxelValue(float value) const {
    if (value <= 0.0f) return 0;
    if (value >= static_cast<float>(UINT16_MAX)) return UINT16_MAX;
    return static_cast<uint16_t>(value + 0.5f);
}

float VolumeBuilder::sampleVolume(float x, float y, float z) const {
    float fx = x;
    float fy = y;
    float fz = z;

    if (fx < 0.0f) fx = 0.0f;
    if (fx > static_cast<float>(m_width - 1)) fx = static_cast<float>(m_width - 1);
    if (fy < 0.0f) fy = 0.0f;
    if (fy > static_cast<float>(m_height - 1)) fy = static_cast<float>(m_height - 1);
    if (fz < 0.0f) fz = 0.0f;
    if (fz > static_cast<float>(m_depth - 1)) fz = static_cast<float>(m_depth - 1);

    int x0 = static_cast<int>(std::floor(fx));
    int y0 = static_cast<int>(std::floor(fy));
    int z0 = static_cast<int>(std::floor(fz));
    int x1 = x0 + 1;
    int y1 = y0 + 1;
    int z1 = z0 + 1;

    if (x1 >= m_width) x1 = m_width - 1;
    if (y1 >= m_height) y1 = m_height - 1;
    if (z1 >= m_depth) z1 = m_depth - 1;

    float tx = fx - static_cast<float>(x0);
    float ty = fy - static_cast<float>(y0);
    float tz = fz - static_cast<float>(z0);

    float v000 = static_cast<float>(getVoxel(x0, y0, z0));
    float v100 = static_cast<float>(getVoxel(x1, y0, z0));
    float v010 = static_cast<float>(getVoxel(x0, y1, z0));
    float v110 = static_cast<float>(getVoxel(x1, y1, z0));
    float v001 = static_cast<float>(getVoxel(x0, y0, z1));
    float v101 = static_cast<float>(getVoxel(x1, y0, z1));
    float v011 = static_cast<float>(getVoxel(x0, y1, z1));
    float v111 = static_cast<float>(getVoxel(x1, y1, z1));

    float v00 = lerp(v000, v100, tx);
    float v10 = lerp(v010, v110, tx);
    float v01 = lerp(v001, v101, tx);
    float v11 = lerp(v011, v111, tx);

    float v0 = lerp(v00, v10, ty);
    float v1 = lerp(v01, v11, ty);

    float v = lerp(v0, v1, tz);

    return v;
}

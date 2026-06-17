#ifndef VOLUME_BUILDER_H
#define VOLUME_BUILDER_H

#include <cstdint>
#include <vector>
#include <memory>

class VolumeBuilder {
public:
    VolumeBuilder(int width, int height, int depth);
    ~VolumeBuilder();

    void setSpacing(float sx, float sy, float sz);

    bool addSlice(int zIndex, const uint16_t* sliceData, int sliceSize);

    bool buildVolume();

    uint16_t* getVoxelData() const;

    int getWidth() const { return m_width; }
    int getHeight() const { return m_height; }
    int getDepth() const { return m_depth; }

    uint16_t getVoxel(int x, int y, int z) const;

    float sampleVolume(float x, float y, float z) const;

    uint16_t getMinValue() const { return m_minValue; }
    uint16_t getMaxValue() const { return m_maxValue; }

private:
    int m_width;
    int m_height;
    int m_depth;
    float m_spacingX;
    float m_spacingY;
    float m_spacingZ;

    std::vector<uint16_t> m_voxelData;
    bool m_built;
    uint16_t m_minValue;
    uint16_t m_maxValue;

    bool isValidCoordinate(int x, int y, int z) const;

    static float lerp(float a, float b, float t);

    uint16_t clampVoxelValue(float value) const;
};

#endif

#include <emscripten/bind.h>
#include "VolumeBuilder.h"

using namespace emscripten;

EMSCRIPTEN_BINDINGS(volume_module) {
    class_<VolumeBuilder>("VolumeBuilder")
        .constructor<int, int, int>()
        .function("setSpacing", &VolumeBuilder::setSpacing)
        .function("addSlice", &VolumeBuilder::addSlice, allow_raw_pointers())
        .function("buildVolume", &VolumeBuilder::buildVolume)
        .function("getVoxelData", &VolumeBuilder::getVoxelData, allow_raw_pointers())
        .function("getWidth", &VolumeBuilder::getWidth)
        .function("getHeight", &VolumeBuilder::getHeight)
        .function("getDepth", &VolumeBuilder::getDepth)
        .function("getVoxel", &VolumeBuilder::getVoxel)
        .function("sampleVolume", &VolumeBuilder::sampleVolume)
        .function("getMinValue", &VolumeBuilder::getMinValue)
        .function("getMaxValue", &VolumeBuilder::getMaxValue);
}

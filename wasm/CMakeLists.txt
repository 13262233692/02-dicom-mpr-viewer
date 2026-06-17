cmake_minimum_required(VERSION 3.15)
project(volume-builder)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(SOURCES
    src/VolumeBuilder.cpp
    src/binding.cpp
)

add_executable(volume-builder ${SOURCES})

target_include_directories(volume-builder PRIVATE src)

set_target_properties(volume-builder PROPERTIES
    LINK_FLAGS "\
        --bind \
        -s MODULARIZE=1 \
        -s EXPORT_NAME='createVolumeModule' \
        -s ALLOW_MEMORY_GROWTH=1 \
        -s MAXIMUM_MEMORY=4GB \
        -s EXPORTED_FUNCTIONS='[\"_malloc\",\"_free\"]' \
        -s EXPORTED_RUNTIME_METHODS='[\"ccall\",\"cwrap\",\"getValue\",\"setValue\",\"HEAPU8\",\"HEAPU16\",\"HEAPF32\"]' \
        -O3 \
        --no-entry \
    "
    SUFFIX ".js"
)

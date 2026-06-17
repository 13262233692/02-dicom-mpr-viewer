precision highp sampler3D;

varying vec2 v_uv;

uniform sampler3D u_volumeTexture;
uniform vec3 u_volumeSize;
uniform float u_windowWidth;
uniform float u_windowLevel;
uniform int u_planeType;
uniform float u_slicePosition;
uniform float u_zoom;
uniform vec2 u_pan;
uniform vec2 u_viewportSize;
uniform float u_valueScale;

const int PLANE_AXIAL = 0;
const int PLANE_SAGITTAL = 1;
const int PLANE_CORONAL = 2;

float applyWindowLevel(float value, float windowWidth, float windowLevel) {
  float lower = windowLevel - windowWidth * 0.5;
  return clamp((value - lower) / windowWidth, 0.0, 1.0);
}

void main() {
  vec2 uv = v_uv * 2.0 - 1.0;

  vec2 adjustedUV = uv / u_zoom + u_pan;

  vec3 texCoord = vec3(0.0);
  bool insideVolume = false;

  if (u_planeType == PLANE_AXIAL) {
    texCoord = vec3(
      adjustedUV.x * 0.5 + 0.5,
      adjustedUV.y * 0.5 + 0.5,
      u_slicePosition
    );
    insideVolume = abs(adjustedUV.x) <= 1.0 && abs(adjustedUV.y) <= 1.0;
  } else if (u_planeType == PLANE_SAGITTAL) {
    texCoord = vec3(
      u_slicePosition,
      adjustedUV.x * 0.5 + 0.5,
      adjustedUV.y * 0.5 + 0.5
    );
    insideVolume = abs(adjustedUV.x) <= 1.0 && abs(adjustedUV.y) <= 1.0;
  } else {
    texCoord = vec3(
      adjustedUV.x * 0.5 + 0.5,
      u_slicePosition,
      adjustedUV.y * 0.5 + 0.5
    );
    insideVolume = abs(adjustedUV.x) <= 1.0 && abs(adjustedUV.y) <= 1.0;
  }

  float voxelValue = 0.0;

  if (insideVolume &&
      texCoord.x >= 0.0 && texCoord.x <= 1.0 &&
      texCoord.y >= 0.0 && texCoord.y <= 1.0 &&
      texCoord.z >= 0.0 && texCoord.z <= 1.0) {
    voxelValue = texture(u_volumeTexture, texCoord).r * u_valueScale;
  }

  float pixelValue = applyWindowLevel(voxelValue, u_windowWidth, u_windowLevel);

  vec3 bgColor = vec3(0.06, 0.07, 0.09);

  vec3 finalColor = mix(bgColor, vec3(pixelValue), insideVolume ? 1.0 : 0.0);

  gl_FragColor = vec4(finalColor, 1.0);
}

precision highp sampler3D;

varying vec2 v_uv;
varying vec3 v_worldPos;

uniform sampler3D u_volumeTexture;
uniform vec3 u_volumeDimensions;
uniform vec3 u_volumeSpacing;
uniform float u_windowWidth;
uniform float u_windowLevel;
uniform int u_planeType;
uniform float u_slicePosition;
uniform float u_zoom;
uniform vec2 u_pan;
uniform float u_minValue;
uniform float u_maxValue;

const int PLANE_AXIAL = 0;
const int PLANE_SAGITTAL = 1;
const int PLANE_CORONAL = 2;

float applyWindowLevel(float value, float windowWidth, float windowLevel) {
  float lower = windowLevel - windowWidth * 0.5;
  float upper = windowLevel + windowWidth * 0.5;
  if (windowWidth <= 0.0) return value > windowLevel ? 1.0 : 0.0;
  return clamp((value - lower) / windowWidth, 0.0, 1.0);
}

void main() {
  vec2 uv = v_uv * 2.0 - 1.0;

  vec2 adjustedUV = uv / u_zoom + u_pan;

  vec3 texCoord = vec3(0.0);
  float inPlane = 0.0;

  if (u_planeType == PLANE_AXIAL) {
    texCoord = vec3(
      adjustedUV.x * 0.5 + 0.5,
      adjustedUV.y * 0.5 + 0.5,
      u_slicePosition
    );
    if (abs(adjustedUV.x) <= 1.0 && abs(adjustedUV.y) <= 1.0) {
      inPlane = 1.0;
    }
  } else if (u_planeType == PLANE_SAGITTAL) {
    texCoord = vec3(
      u_slicePosition,
      adjustedUV.x * 0.5 + 0.5,
      adjustedUV.y * 0.5 + 0.5
    );
    if (abs(adjustedUV.x) <= 1.0 && abs(adjustedUV.y) <= 1.0) {
      inPlane = 1.0;
    }
  } else {
    texCoord = vec3(
      adjustedUV.x * 0.5 + 0.5,
      u_slicePosition,
      adjustedUV.y * 0.5 + 0.5
    );
    if (abs(adjustedUV.x) <= 1.0 && abs(adjustedUV.y) <= 1.0) {
      inPlane = 1.0;
    }
  }

  float voxelValue = 0.0;

  if (inPlane > 0.5 &&
      texCoord.x >= 0.0 && texCoord.x <= 1.0 &&
      texCoord.y >= 0.0 && texCoord.y <= 1.0 &&
      texCoord.z >= 0.0 && texCoord.z <= 1.0) {
    float rawValue = texture(u_volumeTexture, texCoord).r;
    voxelValue = u_minValue + rawValue * (u_maxValue - u_minValue);
  }

  float pixelValue = applyWindowLevel(voxelValue, u_windowWidth, u_windowLevel);

  vec3 bgColor = vec3(0.06, 0.07, 0.09);
  vec3 sliceBorderColor = vec3(0.15, 0.18, 0.25);

  vec3 finalColor = mix(bgColor, vec3(pixelValue), inPlane);

  float borderWidth = 0.005;
  vec2 absUV = abs(adjustedUV);
  float borderDist = max(absUV.x, absUV.y);
  float borderFactor = smoothstep(0.99, 1.0, borderDist) * inPlane;
  finalColor = mix(finalColor, sliceBorderColor, borderFactor * 0.5);

  gl_FragColor = vec4(finalColor, 1.0);
}

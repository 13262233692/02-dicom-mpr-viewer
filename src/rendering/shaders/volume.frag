precision highp sampler3D;
precision highp float;

varying vec2 v_uv;
varying vec3 v_worldPos;

uniform sampler3D u_volumeTexture;
uniform sampler3D u_maskTexture;

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
uniform float u_valueScale;
uniform float u_frameToken;
uniform int u_maskEnabled;
uniform float u_maskOpacity;

const int PLANE_AXIAL = 0;
const int PLANE_SAGITTAL = 1;
const int PLANE_CORONAL = 2;

const vec3 BG_COLOR = vec3(0.06, 0.07, 0.09);
const vec3 BORDER_COLOR = vec3(0.15, 0.18, 0.25);

vec3 applyJetColormap(float value) {
  value = clamp(value, 0.0, 1.0);

  vec3 color;

  if (value < 0.125) {
    color = vec3(0.0, 0.0, 0.5 + 4.0 * value);
  } else if (value < 0.375) {
    color = vec3(0.0, 4.0 * (value - 0.125), 1.0);
  } else if (value < 0.625) {
    color = vec3(4.0 * (value - 0.375), 1.0, 1.0 - 4.0 * (value - 0.375));
  } else if (value < 0.875) {
    color = vec3(1.0, 1.0 - 4.0 * (value - 0.625), 0.0);
  } else {
    color = vec3(1.0 - 4.0 * (value - 0.875), 0.0, 0.0);
  }

  return color;
}

float applyWindowLevel(float value, float windowWidth, float windowLevel) {
  if (windowWidth <= 0.0) {
    return step(windowLevel, value);
  }
  float lower = windowLevel - windowWidth * 0.5;
  float normalized = (value - lower) / windowWidth;
  return clamp(normalized, 0.0, 1.0);
}

bool isValidTexCoord(vec3 texCoord) {
  return all(greaterThanEqual(texCoord, vec3(0.0))) &&
         all(lessThanEqual(texCoord, vec3(1.0)));
}

vec3 getTexCoord(int planeType, vec2 adjustedUV, float slicePosition) {
  if (planeType == PLANE_AXIAL) {
    return vec3(
      adjustedUV.x * 0.5 + 0.5,
      adjustedUV.y * 0.5 + 0.5,
      slicePosition
    );
  } else if (planeType == PLANE_SAGITTAL) {
    return vec3(
      slicePosition,
      adjustedUV.x * 0.5 + 0.5,
      adjustedUV.y * 0.5 + 0.5
    );
  } else {
    return vec3(
      adjustedUV.x * 0.5 + 0.5,
      slicePosition,
      adjustedUV.y * 0.5 + 0.5
    );
  }
}

void main() {
  vec2 uv = v_uv * 2.0 - 1.0;
  vec2 adjustedUV = uv / max(u_zoom, 0.001) + u_pan;

  float inPlaneMask = 0.0;
  if (all(lessThanEqual(abs(adjustedUV), vec2(1.0)))) {
    inPlaneMask = 1.0;
  }

  vec3 texCoord = getTexCoord(u_planeType, adjustedUV, u_slicePosition);

  float voxelValue = 0.0;
  float validMask = 0.0;

  if (inPlaneMask > 0.5 && isValidTexCoord(texCoord)) {
    float rawSample = texture(u_volumeTexture, texCoord).r;
    float denormalized = u_minValue + rawSample * max(u_maxValue - u_minValue, 1.0);
    voxelValue = denormalized;
    validMask = 1.0;
  }

  float grayValue = applyWindowLevel(voxelValue, u_windowWidth, u_windowLevel);
  vec3 grayColor = vec3(grayValue);

  float maskValue = 0.0;

  if (u_maskEnabled == 1 && validMask > 0.5 && inPlaneMask > 0.5) {
    if (isValidTexCoord(texCoord)) {
      maskValue = texture(u_maskTexture, texCoord).r;
    }
  }

  vec3 finalColor = mix(BG_COLOR, grayColor, validMask * inPlaneMask);

  if (u_maskEnabled == 1 && maskValue > 0.01) {
    vec3 jetColor = applyJetColormap(grayValue);

    vec3 texelSize = 1.0 / vec3(
      u_volumeDimensions.x,
      u_volumeDimensions.y,
      u_volumeDimensions.z
    );

    float edgeValue = 0.0;
    float m0 = texture(u_maskTexture, texCoord + vec3(texelSize.x, 0.0, 0.0)).r;
    float m1 = texture(u_maskTexture, texCoord - vec3(texelSize.x, 0.0, 0.0)).r;
    float m2 = texture(u_maskTexture, texCoord + vec3(0.0, texelSize.y, 0.0)).r;
    float m3 = texture(u_maskTexture, texCoord - vec3(0.0, texelSize.y, 0.0)).r;
    edgeValue = abs(maskValue - m0) + abs(maskValue - m1) + abs(maskValue - m2) + abs(maskValue - m3);
    edgeValue = clamp(edgeValue, 0.0, 1.0);

    vec3 maskedColor = mix(grayColor, jetColor, u_maskOpacity * maskValue);

    if (edgeValue > 0.3) {
      vec3 edgeColor = vec3(1.0, 0.9, 0.3);
      float edgeIntensity = smoothstep(0.3, 0.8, edgeValue);
      maskedColor = mix(maskedColor, edgeColor, edgeIntensity * 0.7);
    }

    finalColor = mix(finalColor, maskedColor, maskValue * u_maskOpacity);
  }

  vec2 absUV = abs(adjustedUV);
  float borderDist = max(absUV.x, absUV.y);
  float borderFactor = smoothstep(0.985, 1.0, borderDist) * inPlaneMask;
  finalColor = mix(finalColor, BORDER_COLOR, borderFactor * 0.4);

  gl_FragColor = vec4(finalColor, 1.0);
}

varying vec2 v_uv;
varying vec3 v_rayOrigin;
varying vec3 v_rayDirection;

uniform vec3 u_cameraPos;
uniform mat4 u_inverseViewProjection;

void main() {
  v_uv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);

  vec4 clipPos = vec4(position.xy, -1.0, 1.0);
  vec4 viewPos = u_inverseViewProjection * clipPos;
  vec3 worldPos = viewPos.xyz / viewPos.w;

  v_rayOrigin = u_cameraPos;
  v_rayDirection = normalize(worldPos - u_cameraPos);
}

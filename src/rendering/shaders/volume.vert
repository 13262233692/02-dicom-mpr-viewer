varying vec2 v_uv;
varying vec3 v_worldPos;

void main() {
  v_uv = uv;
  v_worldPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

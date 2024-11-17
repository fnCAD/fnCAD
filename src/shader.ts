import { Node } from './ast';

export function generateShader(ast: Node): string {
  return `
    uniform vec2 resolution;
    uniform mat4 customViewMatrix;
    uniform vec3 customCameraPosition;
    uniform sampler2D octreeBuffer;

    // Convert world position to UV coordinates for octree texture lookup
    vec2 worldToUV(vec3 worldPos) {
      // Project point using same view/projection as octree render
      vec4 projected = customViewMatrix * vec4(worldPos, 1.0);
      // Convert to NDC space (-1 to 1)
      vec2 ndc = projected.xy / projected.w;
      // Convert to UV space [0,1]
      return vec2(ndc.x * 0.5 + 0.5, ndc.y * 0.5 + 0.5);
    }

    float scene(vec3 pos) {
      return ${ast.toGLSL()};
    }

    vec3 calcNormal(vec3 p) {
      const float h = 0.0001;
      const vec2 k = vec2(1,-1);
      return normalize(
        k.xyy * scene(p + k.xyy*h) +
        k.yyx * scene(p + k.yyx*h) +
        k.yxy * scene(p + k.yxy*h) +
        k.xxx * scene(p + k.xxx*h)
      );
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / resolution;
      
      // Debug visualization:
      // Red: UV.x
      // Green: UV.y
      // Blue: Raw texture alpha
      vec4 octreeData = texture2D(octreeBuffer, uv);
      gl_FragColor = vec4(uv.x, uv.y, octreeData.a, 1.0);
    }
  `;
}


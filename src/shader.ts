import { Node, NodeType } from './ast';

export function generateShader(ast: Node): string {
  return `
    uniform vec2 resolution;
    uniform mat4 customViewMatrix;
    uniform vec3 customCameraPosition;

    float scene(vec3 p) {
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
      vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
      
      vec3 ro = customCameraPosition;
      
      // Create view ray using camera transform
      vec3 rd = normalize(vec3(uv.x, uv.y, -1.0));  // Ray in camera space
      rd = (customViewMatrix * vec4(rd, 0.0)).xyz;   // Transform to world space
      
      // Visualize ray direction as color
      vec3 debugCol = 0.5 + 0.5 * normalize(rd);
      
      // Project world-space camera position to view space
      vec3 viewSpaceCamera = (customViewMatrix * vec4(ro, 1.0)).xyz;
      vec2 cameraScreenPos = viewSpaceCamera.xy / -viewSpaceCamera.z;
      
      // Add a dot at the projected camera position
      float cameraDot = smoothstep(0.03, 0.01, length(uv - cameraScreenPos));
      debugCol = mix(debugCol, vec3(1.0, 0.0, 0.0), cameraDot);
      
      gl_FragColor = vec4(debugCol, 1.0);
    }
  `;
}


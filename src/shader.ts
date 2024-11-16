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
      vec3 rd = normalize(vec3(uv, -1.0));
      rd = normalize((customViewMatrix * vec4(rd, 0.0)).xyz);
      
      float t = 0.0;
      for(int i = 0; i < 100; i++) {
        vec3 p = ro + rd * t;
        float d = scene(p);
        if(d < 0.001) {
          vec3 n = calcNormal(p);
          vec3 l = normalize(vec3(1.0, 1.0, 1.0));
          float diff = max(0.0, dot(n, l));
          vec3 col = vec3(0.5 + 0.5 * diff);
          gl_FragColor = vec4(col, 1.0);
          return;
        }
        if(t > 20.0) break;
        t += d;
      }
      // Create a subtle background gradient based on view direction
      vec3 bgCol = vec3(0.1) + 0.05 * rd;
      gl_FragColor = vec4(bgCol, 1.0);
    }
  `;
}


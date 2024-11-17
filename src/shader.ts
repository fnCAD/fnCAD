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

    vec3 getRayDirection(vec2 uv, vec3 camPos, mat4 viewMatrix) {
      // Convert UV to NDC space (-1 to 1)
      vec2 ndc = (uv * 2.0 - 1.0);
      
      // Create ray in view space
      vec3 rayView = normalize(vec3(ndc.x, ndc.y, -1.0));
      
      // Convert ray to world space using the inverse view matrix
      vec4 rayWorld = inverse(viewMatrix) * vec4(rayView, 0.0);
      return normalize(rayWorld.xyz);
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / resolution;
      vec3 rayDir = getRayDirection(uv, customCameraPosition, customViewMatrix);
      vec3 rayOrigin = customCameraPosition;
      
      float t = 0.0;
      const int MAX_STEPS = 100;
      const float MAX_DIST = 100.0;
      const float EPSILON = 0.001;
      
      // Raymarching loop
      for(int i = 0; i < MAX_STEPS; i++) {
        vec3 pos = rayOrigin + rayDir * t;
        float d = scene(pos);
        
        if(d < EPSILON) {
          // Hit surface - calculate normal and lighting
          vec3 normal = calcNormal(pos);
          vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
          float diff = max(dot(normal, lightDir), 0.0);
          vec3 color = vec3(0.8) * (0.2 + 0.8 * diff);
          
          gl_FragColor = vec4(color, 1.0);
          return;
        }
        
        if(t > MAX_DIST) {
          // Miss - show background color
          gl_FragColor = vec4(0.1, 0.1, 0.1, 1.0);
          return;
        }
        
        t += d;
      }
      
      // Max steps reached - show debug color
      gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    }
  `;
}


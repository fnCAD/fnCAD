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
      // Convert pixel coordinates to normalized device coordinates (-1 to +1)
      vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
      
      // Ray origin is the camera position
      vec3 ro = customCameraPosition;
      
      // Calculate ray direction with proper FOV and aspect ratio
      float fov = radians(75.0); // 75 degree field of view
      float aspect = resolution.x / resolution.y;
      vec3 rd = normalize(vec3(uv.x * aspect * tan(fov/2.0), 
                              uv.y * tan(fov/2.0), 
                              -1.0));
      // Transform ray direction to world space
      rd = (inverse(customViewMatrix) * vec4(rd, 0.0)).xyz;

      // Background visualization based on ray direction
      vec3 background = normalize(rd) * 0.5 + 0.5; // Map from [-1,1] to [0,1]
      background *= background; // Make colors more vibrant
      
      // Raymarching
      float t = 0.0;
      float tmax = 20.0;
      
      for(int i = 0; i < 100; i++) {
        vec3 p = ro + rd * t;
        float d = scene(p);
        
        // Hit check
        if(d < 0.001) {
          // Calculate normal
          vec3 n = calcNormal(p);
          // Enhanced lighting with ambient
          float diff = max(dot(n, normalize(vec3(1,1,1))), 0.0);
          vec3 col = vec3(0.2 + 0.8 * diff); // Add some ambient light
          gl_FragColor = vec4(col, 1.0);
          return;
        }
        
        // Missed or too far
        if(t > tmax) {
          gl_FragColor = vec4(background, 1.0);
          return;
        }
        
        t += d;
      }
      
      // Max steps reached - visualize number of steps taken
      float stepViz = float(i) / 100.0; // Normalize steps to 0-1 range
      vec3 debugColor = vec3(stepViz, 0.0, 0.0); // Red channel shows step count
      gl_FragColor = vec4(mix(background, debugColor, 0.5), 1.0);
    }
  `;
}


import { Node } from './sdf_expressions/ast';
import { GLSLContext, GLSLGenerator } from './sdf_expressions/glslgen';

export function generateShader(ast: Node): string {
  const generator = new GLSLGenerator();
  const context = new GLSLContext(generator);
  const result = ast.toGLSL(context);
  
  return `
    uniform vec2 resolution;
    uniform mat4 customViewMatrix;
    uniform mat4 projectionMatrix;
    uniform vec3 customCameraPosition;
    uniform float fov;
    uniform sampler2D previewSceneBuffer;
    uniform sampler2D previewSceneDepth;

    float sqr(float x) {
      return x * x;
    }

    float smooth_union(float d1, float d2, float r) {
      // For points far from the intersection (> 2*radius), just use regular min
      if (max(d1, d2) > r * 2.0) {
        return min(d1, d2);
      }

      // Otherwise compute the smooth union
      float k = 1.0/r;
      return -log(exp(-k * d1) + exp(-k * d2)) * r;
    }

    float scene(vec3 pos) {
      ${generator.generateCode()}
      return ${result};
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
      
      // Calculate ray direction in view space using FOV
      float halfFovRad = radians(fov) * 0.5;
      float aspect = resolution.x / resolution.y;
      vec3 rayView = vec3(
        ndc.x * aspect * tan(halfFovRad),
        ndc.y * tan(halfFovRad),
        -1.0
      );
      
      // Transform ray to world space
      mat3 viewToWorld = mat3(inverse(viewMatrix));
      return viewToWorld * rayView;
    }

    void main() {
      // Convert pixel coordinates to normalized device coordinates (-1 to +1)
      vec2 ndc = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
      vec2 uv = gl_FragCoord.xy / resolution.xy;

      // Ray origin is the camera position
      vec3 ro = customCameraPosition;

      // Get ray direction using our helper function
      vec3 rd = getRayDirection(gl_FragCoord.xy / resolution.xy, ro, customViewMatrix);

      // Background visualization based on ray direction
      vec3 background = normalize(rd) * 0.5 + 0.5; // Map from [-1,1] to [0,1]
      background *= background; // Make colors more vibrant

      // Raymarching
      float t = 0.0;
      float tmax = 1000.0; // Match camera far plane

      // Sample preview scene at current position
      vec4 previewSceneData = texture2D(previewSceneBuffer, uv);

      const int MAX_STEPS = 256;
      for(int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * t;

        float d = scene(p);

        // Hit check with adaptive epsilon based on distance
        float eps = max(0.0001, 0.0001 * t);
        if(d < eps) {
          // Calculate normal
          vec3 n = calcNormal(p);
          // Enhanced lighting with ambient
          float diff = max(dot(n, normalize(vec3(1,1,1))), 0.0);
          vec3 col = vec3(0.2 + 0.8 * diff); // Add some ambient light

          // Convert hit point to view space
          vec4 clipPos = customViewMatrix * vec4(ro + rd * t, 1.0);
          float viewSpaceDepth = -clipPos.z; // View space depth is negative of z in view space
          
          // Get depth from preview scene depth buffer [0,1]
          float previewSceneDepth = texture2D(previewSceneDepth, uv).r;
          
          // Convert raymarched hit point to clip space using view and projection matrices
          vec4 rayWorldPos = vec4(ro + rd * t, 1.0);
          vec4 rayViewPos = customViewMatrix * rayWorldPos;
          vec4 rayClipPos = projectionMatrix * rayViewPos;
          
          // Perspective divide to get NDC coordinates
          vec3 rayNDC = rayClipPos.xyz / rayClipPos.w;
          
          // Convert to depth buffer space [0,1]
          float rayDepth = rayNDC.z * 0.5 + 0.5;
          
          // Mix in preview scene if visible and closer
          if(previewSceneData.a > 0.5) {
            vec3 previewSceneColor = previewSceneData.rgb;

            // Compare depths in [0,1] space
            // Smaller depth values are closer to camera
            if (previewSceneDepth < rayDepth) {
              gl_FragColor = vec4(previewSceneColor, 1.0);
              return;
            }
          }

          gl_FragColor = vec4(col, 1.0);
          return;
        }
        // Missed or too far
        if(t > tmax) {
          break;
        }

        // Adaptive step size for better performance
        t += d * 0.9; // Slightly conservative step for stability
      }

      // If no hit but preview scene is visible, show visualization as if unoccluded
      if(previewSceneData.a > 0.5) {
        gl_FragColor = vec4(mix(background, previewSceneData.rgb, 0.5), 1.0);
        return;
      }

      gl_FragColor = vec4(background, 1.0);
    }
  `;
}


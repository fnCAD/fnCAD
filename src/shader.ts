import { Node } from './ast';

export function generateShader(_ast: Node): string {
  // Placeholder - we'll implement this next
  return `
    void main() {
      gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    }
  `;
}

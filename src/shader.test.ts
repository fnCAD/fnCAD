import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { parse } from './parser';
import { generateShader } from './shader';
import { Node } from './ast';

// Software raymarcher for testing
type RaymarchLogger = (step: number, point: THREE.Vector3, distance: number) => void;

function raymarch(
  sdf: Node, 
  rayOrigin: THREE.Vector3, 
  rayDir: THREE.Vector3,
  logger?: RaymarchLogger
): number | null {
  const MAX_STEPS = 100;
  const MAX_DIST = 20.0;
  const EPSILON = 0.001;
  
  let t = 0.0;
  
  for (let i = 0; i < MAX_STEPS; i++) {
    const p = new THREE.Vector3().copy(rayDir).multiplyScalar(t).add(rayOrigin);
    const d = sdf.evaluate({
      x: p.x,
      y: p.y,
      z: p.z
    });
    
    if (logger) {
      logger(i, p, d);
    }
    
    if (d < EPSILON) {
      return t; // Hit
    }
    
    t += d;
    
    if (t > MAX_DIST) {
      return null; // Miss
    }
  }
  
  return null; // Max steps exceeded
}

describe('Shader Generation and Raymarching', () => {
  // Helper to compile and test a shader
  async function testShader(expr: string): Promise<boolean> {
    const ast = parse(expr);
    const shaderCode = generateShader(ast);
    
    // Create an offscreen renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: new OffscreenCanvas(1, 1)
    });
    
    try {
      new THREE.ShaderMaterial({
        fragmentShader: shaderCode,
        vertexShader: THREE.ShaderLib.basic.vertexShader
      });
      
      // If shader compilation succeeds, this won't throw
      renderer.compile(new THREE.Scene(), new THREE.Camera());
      return true;
    } catch (e) {
      return false;
    } finally {
      renderer.dispose();
    }
  }

  it.skip('generates valid shader for simple expressions', async () => {
    expect(await testShader('x * x + y * y + z * z - 1')).toBe(true);
  });

  it('correctly raymarches stretched sphere from all angles', () => {
    const ast = parse('sqrt(sqr(x) + sqr(y) + sqr(z * 2)) - 1.0');
    
    // Test from different angles
    const angles = [
      new THREE.Vector3(1, 0, 0),   // +X
      new THREE.Vector3(-1, 0, 0),  // -X
      new THREE.Vector3(0, 1, 0),   // +Y
      new THREE.Vector3(0, -1, 0),  // -Y
      new THREE.Vector3(0, 0, 1),   // +Z (thin side)
      new THREE.Vector3(0, 0, -1),  // -Z (thin side)
    ];
    
    // Ray origin far enough to see whole shape
    const rayOrigin = new THREE.Vector3(0, 0, -5);
    
    for (const dir of angles) {
      try {
        const hit = raymarch(ast, rayOrigin, dir.normalize());
        expect(hit).not.toBeNull();
      } catch (e) {
        if (e instanceof Error && e.name === 'AssertionError') {
          // Re-run with logging on failure
          console.log(`\nFailed raymarching in direction ${dir.toArray()}`);
          raymarch(ast, rayOrigin, dir.normalize(), (step, point, distance) => {
            console.log(`Step ${step}: point ${point.toArray()}, distance ${distance}`);
          });
          throw e; // Re-throw to fail the test
        }
        throw e; // Re-throw unexpected errors
      }
    }
  });

  it('generates correct GLSL for multi-argument min/max', async () => {
    const ast = parse('min(1, 2, 3)');
    const shaderCode = generateShader(ast);
    expect(shaderCode).toContain('min(min(1.0, 2.0), 3.0)');

    const ast2 = parse('max(1, 2, 3, 4)');
    const shaderCode2 = generateShader(ast2);
    expect(shaderCode2).toContain('max(max(max(1.0, 2.0), 3.0), 4.0)');
  });
});

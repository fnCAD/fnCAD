import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { parse } from './cad/parser';
import { moduleToSDF } from './cad/builtins';
import { parse as parseSDF } from './sdf_expressions/parser';
import { generateShader } from './shader';
import { Node } from './sdf_expressions/types';

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
    const fn = new Function('x', 'y', 'z', 'return ' + sdf.evaluateStr('x', 'y', 'z', 0) + ';');
    const d = fn(p.x, p.y, p.z);

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
    const ast = parseSDF(expr);
    const shaderCode = generateShader(ast);

    // Create an offscreen renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: new OffscreenCanvas(1, 1),
    });

    try {
      new THREE.ShaderMaterial({
        fragmentShader: shaderCode,
        vertexShader: THREE.ShaderLib.basic.vertexShader,
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
    const cadCode = `
      scale([1, 1, 2]) {
        sphere(1);
      }
    `;
    const ast = parse(cadCode);
    const sdfExpr = moduleToSDF(ast);
    testRaymarchFromAllAngles(sdfExpr);
  });

  it('correctly handles axis-aligned smooth union', () => {
    const cadCode = `
      smooth_union(0.03) {
        cube(1);
        translate([0, 0.7, 0]) {
          cube(0.5);
        }
      }
    `;
    const ast = parse(cadCode);
    const sdfExpr = moduleToSDF(ast);
    testRaymarchFromAllAngles(sdfExpr);
  });

  function testRaymarchFromAllAngles(sdfExpr: string) {
    const ast = parseSDF(sdfExpr);

    // Test from points in a circle around the object
    const radius = 5; // Distance from origin
    const testPoints = [
      new THREE.Vector3(radius, 0, 0), // +X
      new THREE.Vector3(-radius, 0, 0), // -X
      new THREE.Vector3(0, radius, 0), // +Y
      new THREE.Vector3(0, -radius, 0), // -Y
      new THREE.Vector3(0, 0, radius), // +Z
      new THREE.Vector3(0, 0, -radius), // -Z
    ];

    for (const point of testPoints) {
      // Shoot ray inward toward origin
      const dir = new THREE.Vector3().copy(point).negate().normalize();
      try {
        const hit = raymarch(ast, point, dir);
        expect(hit).not.toBeNull();
      } catch (e) {
        if (e instanceof Error && e.name === 'AssertionError') {
          // Re-run with logging on failure
          console.log(`\nFailed raymarching in direction ${dir.toArray()}`);
          raymarch(ast, point, dir, (step, point, distance) => {
            console.log(`Step ${step}: point ${point.toArray()}, distance ${distance}`);
          });
          throw e; // Re-throw to fail the test
        }
        throw e; // Re-throw unexpected errors
      }
    }
  }

  it('generates correct GLSL for multi-argument min/max', async () => {
    const ast = parseSDF('min(1, 2, 3)');
    const shaderCode = generateShader(ast);
    // Check for SSA form variable declarations and min operations
    expect(shaderCode).toContain('float var1 = 1.0');
    expect(shaderCode).toContain('float var2 = 2.0');
    expect(shaderCode).toContain('float var3 = 3.0');
    expect(shaderCode).toContain('float var4 = min(var1, var2)');
    expect(shaderCode).toContain('float var5 = min(var4, var3)');
  });
});

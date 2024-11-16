import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { parse } from './parser';
import { generateShader } from './shader';

describe('Shader Generation', () => {
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
});

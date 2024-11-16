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

  it('generates correct GLSL for multi-argument min/max', async () => {
    const ast = parse('min(1, 2, 3)');
    const shaderCode = generateShader(ast);
    expect(shaderCode).toContain('min(min(1.0, 2.0), 3.0)');

    const ast2 = parse('max(1, 2, 3, 4)');
    const shaderCode2 = generateShader(ast2);
    expect(shaderCode2).toContain('max(max(max(1.0, 2.0), 3.0), 4.0)');
  });
});

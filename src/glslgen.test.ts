import { describe, it, expect } from 'vitest';
import { GLSLGenerator } from './glslgen';

describe('GLSLGenerator', () => {
  it('generates translation code', () => {
    const gen = new GLSLGenerator();
    gen.translate(1, 2, 3);
    const code = gen.generateCode();
    expect(code).toContain('vec3 var1 = pos - vec3(1, 2, 3)');
  });

  it('generates rotation code', () => {
    const gen = new GLSLGenerator();
    gen.rotate(Math.PI/2, 0, 0); // 90 degrees around X axis
    const code = gen.generateCode();
    expect(code).toContain('mat3');
    // Should contain rotation matrix values for 90 degree X rotation
    expect(code).toContain('1, 0, 0'); // First row approximately
    expect(code).toContain('0, 0, -1'); // Second row approximately 
    expect(code).toContain('0, 1, 0'); // Third row approximately
  });

  it('chains transformations', () => {
    const gen = new GLSLGenerator();
    gen.translate(1, 0, 0);
    gen.rotate(0, Math.PI/2, 0);
    const code = gen.generateCode();
    expect(code.split('\n').length).toBe(2); // Should have 2 statements
    expect(code).toContain('var1 = pos - vec3(1, 0, 0)');
    expect(code).toContain('var2 = mat3');
  });
});

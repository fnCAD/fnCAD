import { describe, it, expect } from 'vitest';
import { GLSLGenerator, GLSLContext } from './glslgen';

describe('GLSLContext', () => {
  it('generates translation code', () => {
    const gen = new GLSLGenerator();
    const ctx = new GLSLContext(gen);
    ctx.translate(1, 2, 3);
    const code = gen.generateCode();
    expect(code).toBe('vec3 var1 = pos - vec3(1, 2, 3);');
  });

  it('generates rotation code', () => {
    const gen = new GLSLGenerator();
    const ctx = new GLSLContext(gen);
    ctx.rotate(Math.PI/2, 0, 0); // 90 degrees around X axis
    const code = gen.generateCode().split('\n');
    expect(code.length).toBe(1);
    expect(code[0]).toMatch(/^vec3 var1 = mat3\(/);
    expect(code[0]).toMatch(/1,\s*0,\s*0/); // First row
    expect(code[0]).toMatch(/0,\s*0,\s*-1/); // Second row
    expect(code[0]).toMatch(/0,\s*1,\s*0/); // Third row
  });

  it('chains transformations', () => {
    const gen = new GLSLGenerator();
    const ctx = new GLSLContext(gen);
    ctx.translate(1, 0, 0);
    ctx.rotate(0, Math.PI/2, 0);
    const code = gen.generateCode().split('\n');
    expect(code.length).toBe(2);
    expect(code[0]).toBe('vec3 var1 = pos - vec3(1, 0, 0);');
    expect(code[1]).toMatch(/^vec3 var2 = mat3\(/);
  });

  it('supports context branching', () => {
    const gen = new GLSLGenerator();
    const ctx1 = new GLSLContext(gen);
    ctx1.translate(1, 0, 0);
    const ctx2 = ctx1.withPoint(ctx1.getPoint());
    ctx2.rotate(0, Math.PI/2, 0);
    const code = gen.generateCode().split('\n');
    expect(code.length).toBe(2);
  });
});

import { describe, it, expect } from 'vitest';
import { GLSLGenerator, GLSLContext } from './glslgen';

describe('GLSLContext', () => {
  it('generates translation code', () => {
    const gen = new GLSLGenerator();
    const ctx = new GLSLContext(gen);
    const result = ctx.translate(1, 2, 3);
    expect(gen.generateCode().split('\n')).toEqual([
      'vec3 var1 = pos - vec3(1, 2, 3);'
    ]);
  });

  it('generates rotation code', () => {
    const gen = new GLSLGenerator();
    const ctx = new GLSLContext(gen);
    const result = ctx.rotate(Math.PI/2, 0, 0); // 90 degrees around X axis
    const code = gen.generateCode().split('\n');
    expect(code).toEqual([
      expect.stringMatching(/^vec3 var1 = mat3\(.*\) \* pos;$/)
    ]);
  });

  it('chains transformations', () => {
    const gen = new GLSLGenerator();
    const ctx = new GLSLContext(gen);
    const ctx2 = ctx.translate(1, 0, 0).rotate(0, Math.PI/2, 0);
    expect(gen.generateCode().split('\n')).toEqual([
      'vec3 var1 = pos - vec3(1, 0, 0);',
      expect.stringMatching(/^vec3 var2 = mat3\(.*\) \* var1;$/)
    ]);
  });

  it('supports context branching', () => {
    const gen = new GLSLGenerator();
    const ctx1 = new GLSLContext(gen);
    const ctx2 = ctx1.translate(1, 0, 0);
    const ctx3 = ctx2.withPoint(ctx2.getPoint()).rotate(0, Math.PI/2, 0);
    expect(gen.generateCode().split('\n')).toEqual([
      'vec3 var1 = pos - vec3(1, 0, 0);',
      expect.stringMatching(/^vec3 var2 = mat3\(.*\) \* var1;$/)
    ]);
  });
});

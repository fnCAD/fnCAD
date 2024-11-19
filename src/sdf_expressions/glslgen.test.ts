import { describe, it, expect } from 'vitest';
import { GLSLGenerator, GLSLContext } from './glslgen';

describe('GLSLContext', () => {
  it('generates translation code', () => {
    const gen = new GLSLGenerator();
    const ctx = new GLSLContext(gen);
    ctx.translate(1, 2, 3);
    expect(gen.generateCode().split('\n')).toEqual([
      'vec3 var1 = pos - vec3(1, 2, 3);'
    ]);
  });

  it('generates rotation code', () => {
    const gen = new GLSLGenerator();
    const ctx = new GLSLContext(gen);
    ctx.rotate(Math.PI/2, 0, 0); // 90 degrees around X axis
    const code = gen.generateCode().split('\n');
    console.log('Generated code:\n', code);
    // Extract matrix values and compare numerically
    expect(code.length).toBe(13);
    expect(code[0]).toBe('vec3 var1 = mat3(');
    
    // Parse the 3x3 matrix values
    const matrixRows = code.slice(1, 4).map(row => 
      row.trim().replace(/,$/, '').split(',').map(Number)
    );
    
    // Expected values for 90° X rotation
    const expectedMatrix = [
      [1, 0, 0],
      [0, 0, -1],
      [0, 1, 0]
    ];
    
    // Compare values with toBeCloseTo
    matrixRows.forEach((row, i) => {
      row.forEach((val, j) => {
        expect(val).toBeCloseTo(expectedMatrix[i][j], 10);
      });
    });
    
    expect(code[4]).toBe('    ) * pos;');
  });

  it('chains transformations', () => {
    const gen = new GLSLGenerator();
    const ctx = new GLSLContext(gen);
    ctx.translate(1, 0, 0).rotate(0, Math.PI/2, 0);
    const code = gen.generateCode().split('\n');
    expect(code[0]).toBe('vec3 var1 = pos - vec3(1, 0, 0);');
    
    // Extract and verify matrix for Y rotation
    expect(code[1]).toBe('vec3 var2 = mat3(');
    
    const matrixRows = code.slice(2, 5).map(row => 
      row.trim().replace(/,$/, '').split(',').map(Number)
    );
    
    // Expected values for 90° Y rotation
    const expectedMatrix = [
      [0, 0, 1],
      [0, 1, 0],
      [-1, 0, 0]
    ];
    
    const epsilon = 1e-10;
    matrixRows.forEach((row, i) => {
      row.forEach((val, j) => {
        expect(Math.abs(val - expectedMatrix[i][j])).toBeLessThan(epsilon);
      });
    });
    
    expect(code[5]).toBe('    ) * var1;');
  });

  it('supports context branching', () => {
    const gen = new GLSLGenerator();
    const ctx1 = new GLSLContext(gen);
    const ctx2 = ctx1.translate(1, 0, 0);
    ctx2.withPoint(ctx2.getPoint()).rotate(0, Math.PI/2, 0);
    const code = gen.generateCode().split('\n');
    expect(code[0]).toBe('vec3 var1 = pos - vec3(1, 0, 0);');
    
    // Extract and verify matrix for Y rotation
    expect(code[1]).toBe('vec3 var2 = mat3(');
    
    const matrixRows = code.slice(2, 5).map(row => 
      row.trim().replace(/,$/, '').split(',').map(Number)
    );
    
    // Expected values for 90° Y rotation
    const expectedMatrix = [
      [0, 0, 1],
      [0, 1, 0],
      [-1, 0, 0]
    ];
    
    const epsilon = 1e-10;
    matrixRows.forEach((row, i) => {
      row.forEach((val, j) => {
        expect(Math.abs(val - expectedMatrix[i][j])).toBeLessThan(epsilon);
      });
    });
    
    expect(code[5]).toBe('    ) * var1;');
  });
});

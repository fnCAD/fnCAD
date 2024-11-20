import { describe, it, expect } from 'vitest';
import { parse } from './parser';
import { Interval } from '../interval';
import { GLSLContext, GLSLGenerator } from './glslgen';
describe('Expression Evaluation', () => {
  function evaluate(expr: string, context: Record<string, number> = {}): number {
    const ast = parse(expr);
    return ast.evaluate(context);
  }

  it('evaluates numbers', () => {
    expect(evaluate('42')).toBe(42);
    expect(evaluate('-42')).toBe(-42);
  });

  it('evaluates basic arithmetic', () => {
    expect(evaluate('2 + 3')).toBe(5);
    expect(evaluate('5 - 3')).toBe(2);
    expect(evaluate('4 * 3')).toBe(12);
    expect(evaluate('12 / 3')).toBe(4);
  });

  it('respects operator precedence', () => {
    expect(evaluate('2 + 3 * 4')).toBe(14);
    expect(evaluate('(2 + 3) * 4')).toBe(20);
  });

  it('evaluates variables', () => {
    expect(evaluate('x + y', { x: 1, y: 2 })).toBe(3);
  });

  it('evaluates functions', () => {
    expect(evaluate('sqrt(16)')).toBe(4);
    expect(evaluate('sin(0)')).toBe(0);
    expect(evaluate('sqr(3)')).toBe(9);
    expect(evaluate('sqr(-2)')).toBe(4);
  });

  it('evaluates min and max functions', () => {
    expect(evaluate('min(3, 5)')).toBe(3);
    expect(evaluate('max(3, 5)')).toBe(5);
    expect(evaluate('min(-2, 2)')).toBe(-2);
    expect(evaluate('max(-2, 2)')).toBe(2);
    expect(evaluate('min(1, 2, 3)')).toBe(1);
    expect(evaluate('max(1, 2, 3)')).toBe(3);
    expect(evaluate('min(3, 1, 2)')).toBe(1);
    expect(evaluate('max(3, 1, 2)')).toBe(3);
  });

  it('evaluates abs function', () => {
    expect(evaluate('abs(-3)')).toBe(3);
    expect(evaluate('abs(3)')).toBe(3);
    expect(evaluate('abs(0)')).toBe(0);
    expect(evaluate('abs(-2.5)')).toBe(2.5);
  });

  it('correctly formats numbers for GLSL', () => {
    const ast = parse('0.01');
    const gen = new GLSLGenerator();
    const context = new GLSLContext(gen);
    const varName = ast.toGLSL(context);
    expect(gen.generateCode()).toMatch(/float var\d+ = 0\.01;/);

    // Test integer values get decimal point
    const intAst = parse('42');
    const intGen = new GLSLGenerator();
    const intContext = new GLSLContext(intGen);
    const intVarName = intAst.toGLSL(intContext);
    expect(intGen.generateCode()).toMatch(/float var\d+ = 42\.0;/);
  });

  it('handles expressions starting with unary minus', () => {
    expect(evaluate('-1')).toBe(-1);
    expect(evaluate('-x', {x: 2})).toBe(-2);
    expect(evaluate('-(1 + 2)')).toBe(-3);
    expect(evaluate('-min(1, 2)')).toBe(-1);
  });

  it('evaluates abs with intervals', () => {
    const ast = parse('abs(x)');
    expect(ast.evaluateInterval({ x: new Interval(-3, -1) })).toEqual(new Interval(1, 3));
    expect(ast.evaluateInterval({ x: new Interval(1, 3) })).toEqual(new Interval(1, 3));
    expect(ast.evaluateInterval({ x: new Interval(-1, 2) })).toEqual(new Interval(0, 2));
  });

  it('handles translate transformation', () => {
    const ast = parse('translate(1, 0, 0, x*x + y*y + z*z - 1)');
    expect(ast.evaluate({ x: 2, y: 0, z: 0 })).toBe(0); // At (2,0,0), we're exactly on the surface of the sphere centered at (1,0,0)
  });

  it('handles rotate transformation', () => {
    const ast = parse('rotate(0, 3.14159/2, 0, x*x + y*y + z*z - 1)');
    expect(ast.evaluate({ x: 1, y: 0, z: 0 })).toBeCloseTo(0, 4); // Should be ~0 at radius 1
  });
});

import { describe, it, expect } from 'vitest';
import { Node } from './types';
import { parse } from './parser';
import { Interval } from '../interval';
import { GLSLContext, GLSLGenerator } from './glslgen';
import { Vector3 } from 'three';

function evaluateNode(ast: Node, p: Vector3) {
  var fn = new Function('x', 'y', 'z', 'return ' + ast.evaluateStr('x', 'y', 'z', 0) + ';');
  return fn(p.x, p.y, p.z);
}

describe('Expression Evaluation', () => {
  function evaluate(
    expr: string,
    coords: Partial<{ x: number; y: number; z: number }> = {}
  ): number {
    const ast = parse(expr);
    return evaluateNode(ast, new Vector3(coords.x ?? 0, coords.y ?? 0, coords.z ?? 0));
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
    expect(evaluate('x + z', { x: 1, z: 3 })).toBe(4);
  });

  it('evaluates functions', () => {
    expect(evaluate('sqrt(16)')).toBe(4);
    expect(evaluate('sin(0)')).toBe(0);
    expect(evaluate('sqr(3)')).toBe(9);
    expect(evaluate('sqr(-2)')).toBe(4);
    expect(evaluate('mod(5, 3)')).toBe(2);
    expect(evaluate('mod(-5, 3)')).toBe(1); // Tests negative handling
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
    const val = ast.toGLSL(context);
    gen.useVar(val);
    expect(gen.varExpr(val)).toMatch('0.01');

    // Test integer values get decimal point
    const intAst = parse('42');
    const intGen = new GLSLGenerator();
    const intContext = new GLSLContext(intGen);
    const intVal = intAst.toGLSL(intContext);
    intGen.useVar(intVal);
    expect(intGen.varExpr(intVal)).toMatch('42.0');
  });

  it('handles expressions starting with unary minus', () => {
    expect(evaluate('-1')).toBe(-1);
    expect(evaluate('-x', { x: 2 })).toBe(-2);
    expect(evaluate('-(1 + 2)')).toBe(-3);
    expect(evaluate('-min(1, 2)')).toBe(-1);
  });

  it('evaluates abs with intervals', () => {
    const ast = parse('abs(x)');
    const zero = new Interval(0, 0);
    expect(ast.evaluateInterval(new Interval(-3, -1), zero, zero)).toEqual(new Interval(1, 3));
    expect(ast.evaluateInterval(new Interval(1, 3), zero, zero)).toEqual(new Interval(1, 3));
    expect(ast.evaluateInterval(new Interval(-1, 2), zero, zero)).toEqual(new Interval(0, 2));
  });

  it('evaluates mod function correctly', () => {
    // Basic positive mod cases
    expect(evaluate('mod(5, 3)')).toBe(2);
    expect(evaluate('mod(10, 3)')).toBe(1);
    expect(evaluate('mod(3, 3)')).toBe(0);

    // Negative value handling
    expect(evaluate('mod(-5, 3)')).toBe(1); // (-5 % 3) + 3 % 3 = (-2 + 3) % 3 = 1
    expect(evaluate('mod(-3, 3)')).toBe(0); // (-3 % 3) + 3 % 3 = (0 + 3) % 3 = 0
    expect(evaluate('mod(-10, 7)')).toBe(4); // (-10 % 7) + 7 % 7 = (-3 + 7) % 7 = 4

    // Decimal values
    expect(evaluate('mod(5.5, 2)')).toBeCloseTo(1.5, 5);
    expect(evaluate('mod(-5.5, 2)')).toBeCloseTo(0.5, 5);

    // Variable modding
    expect(evaluate('mod(x, 4)', { x: 10 })).toBe(2);
    expect(evaluate('mod(7, y)', { y: 2 })).toBe(1);

    // Expression modding
    expect(evaluate('mod(x + y, 5)', { x: 3, y: 7 })).toBe(0);
    expect(evaluate('mod(x * 2, y + 1)', { x: 5, y: 3 })).toBe(2);
  });

  it('evaluates mod with intervals', () => {
    const zero = new Interval(0, 0);

    // Simple constant divisor cases
    const ast1 = parse('mod(x, 3)');
    expect(ast1.evaluateInterval(new Interval(4, 5), zero, zero)).toEqual(new Interval(1, 2));
    expect(ast1.evaluateInterval(new Interval(-5, -4), zero, zero)).toEqual(new Interval(1, 2));

    // Interval spanning multiple periods
    expect(ast1.evaluateInterval(new Interval(1, 5), zero, zero)).toEqual(new Interval(0, 3));

    // Interval crossing period boundary
    expect(ast1.evaluateInterval(new Interval(2, 4), zero, zero)).toEqual(new Interval(0, 3));

    // Variable as divisor (should return conservative estimate)
    const ast2 = parse('mod(5, y)');
    expect(ast2.evaluateInterval(zero, new Interval(2, 4), zero)).toEqual(new Interval(0, 4));
  });

  it('handles translate transformation', () => {
    const ast = parse('translate(1, 0, 0, x*x + y*y + z*z - 1)');
    // At (2,0,0), we're exactly on the surface of the sphere centered at (1,0,0)
    expect(evaluateNode(ast, new Vector3(2, 0, 0))).toBe(0);
  });

  it('handles aabb optimization', () => {
    const ast = parse('aabb(-1, -1, -1, 1, 1, 1, sqrt(x*x + y*y + z*z) - 1)');

    // Test point inside AABB - should use exact SDF
    expect(evaluateNode(ast, new Vector3(0, 0, 0))).toBe(-1);

    // Test point far from AABB in x - should use AABB approximation
    expect(evaluateNode(ast, new Vector3(10, 0, 0))).toBeCloseTo(9, 5);

    // Test point far from AABB in y - should use AABB approximation
    expect(evaluateNode(ast, new Vector3(0, -10, 0))).toBeCloseTo(9, 5);

    // Test point far from AABB in z - should use AABB approximation
    expect(evaluateNode(ast, new Vector3(0, 0, 10))).toBeCloseTo(9, 5);

    // Test point just outside AABB - should use exact SDF
    expect(evaluateNode(ast, new Vector3(1.1, 0, 0))).toBeCloseTo(0.1, 5);
  });

  it('handles rotate transformation', () => {
    const ast = parse('rotate(0, 1.570795, 0, x*x + y*y + z*z - 1)');
    expect(evaluateNode(ast, new Vector3(1, 0, 0))).toBeCloseTo(0, 4); // Should be ~0 at radius 1
  });
});

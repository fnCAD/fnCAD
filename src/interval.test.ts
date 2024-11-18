import { describe, it, expect } from 'vitest';
import { Interval } from './interval';

describe('Interval', () => {
  it('creates valid intervals', () => {
    const i = new Interval(-1, 1);
    expect(i.min).toBe(-1);
    expect(i.max).toBe(1);
  });

  it('throws on invalid intervals', () => {
    expect(() => new Interval(1, -1)).toThrow();
  });

  it('creates point intervals', () => {
    const i = Interval.from(42);
    expect(i.min).toBe(42);
    expect(i.max).toBe(42);
  });

  it('performs basic arithmetic', () => {
    const a = new Interval(-1, 2);
    const b = new Interval(0, 3);

    const sum = a.add(b);
    expect(sum.min).toBe(-1);
    expect(sum.max).toBe(5);

    const diff = a.subtract(b);
    expect(diff.min).toBe(-4);
    expect(diff.max).toBe(2);

    const prod = a.multiply(b);
    expect(prod.min).toBe(-3);
    expect(prod.max).toBe(6);
  });

  it('handles division', () => {
    const a = new Interval(1, 2);
    const b = new Interval(2, 4);
    
    const quot = a.divide(b);
    expect(quot.min).toBe(0.25);
    expect(quot.max).toBe(1);

    const c = new Interval(-1, 1);
    expect(() => a.divide(c)).toThrow();
  });

  it('computes square roots', () => {
    const i = new Interval(0, 4);
    const sqrt = i.sqrt();
    expect(sqrt.min).toBe(0);
    expect(sqrt.max).toBe(2);

    // Should handle negative values by clamping to 0
    const neg = new Interval(-1, 1);
    const sqrtNeg = neg.sqrt();
    expect(sqrtNeg.min).toBe(0);
    expect(sqrtNeg.max).toBe(1);
  });

  it('checks containment', () => {
    const i = new Interval(-1, 1);
    expect(i.contains(0)).toBe(true);
    expect(i.contains(-2)).toBe(false);
    expect(i.contains(2)).toBe(false);
  });

  it('checks intersection', () => {
    const a = new Interval(0, 2);
    const b = new Interval(1, 3);
    const c = new Interval(3, 4);
    
    expect(a.intersects(b)).toBe(true);
    expect(a.intersects(c)).toBe(false);
  });

  it('handles translate transformation', () => {
    const ast = parse('translate(1, 0, 0, x*x + y*y + z*z - 1)');
    const x = new Interval(1.9, 2.1); // Around x=2
    const y = new Interval(-0.1, 0.1); // Around y=0
    const z = new Interval(-0.1, 0.1); // Around z=0
    
    const result = ast.evaluateInterval({ x, y, z });
    expect(result.contains(0)).toBe(true); // Should contain surface point
  });

  it('handles rotate transformation', () => {
    const ast = parse('rotate(0, 3.14159/2, 0, x*x + y*y + z*z - 1)');
    // Test point at (1,0,0) which should rotate to (0,0,-1)
    const x = new Interval(0.9, 1.1);
    const y = new Interval(-0.1, 0.1);
    const z = new Interval(-0.1, 0.1);
    
    const result = ast.evaluateInterval({ x, y, z });
    expect(result.contains(0)).toBe(true); // Should contain surface point
  });
});

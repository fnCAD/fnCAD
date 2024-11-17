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

    const neg = new Interval(-1, 1);
    expect(() => neg.sqrt()).toThrow();
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
});

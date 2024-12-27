/**
 * Represents a closed interval [min, max] on the real number line
 */
export class Interval {
  constructor(
    public readonly min: number,
    public readonly max: number
  ) {
    if (min > max) {
      throw new Error(`Invalid interval: min (${min}) must be <= max (${max})`);
    }
  }

  static from(value: number): Interval {
    return new Interval(value, value);
  }

  contains(value: number): boolean {
    return value >= this.min && value <= this.max;
  }

  intersects(other: Interval): boolean {
    return this.max >= other.min && other.max >= this.min;
  }

  // Basic arithmetic operations
  add(other: Interval): Interval {
    return new Interval(this.min + other.min, this.max + other.max);
  }

  subtract(other: Interval): Interval {
    return new Interval(this.min - other.max, this.max - other.min);
  }

  multiply(other: Interval): Interval {
    const products = [
      this.min * other.min,
      this.min * other.max,
      this.max * other.min,
      this.max * other.max,
    ];
    return new Interval(Math.min(...products), Math.max(...products));
  }

  divide(other: Interval): Interval {
    if (other.contains(0)) {
      throw new Error('Division by interval containing zero');
    }
    const quotients = [
      this.min / other.min,
      this.min / other.max,
      this.max / other.min,
      this.max / other.max,
    ];
    return new Interval(Math.min(...quotients), Math.max(...quotients));
  }

  // Unary operations
  negate(): Interval {
    return new Interval(-this.max, -this.min);
  }

  // Special SDF operations
  smooth_union(other: Interval, radius: number): Interval {
    // For points far from both shapes (> 10*radius), just use regular min
    const minDist = Math.min(this.min, other.min);
    if (minDist > radius * 10.0) {
      return new Interval(Math.min(this.min, other.min), Math.min(this.max, other.max));
    }

    // Otherwise compute the smooth union
    const k = 1.0 / radius;
    const e1min = Math.exp(-k * this.min);
    const e1max = Math.exp(-k * this.max);
    const e2min = Math.exp(-k * other.min);
    const e2max = Math.exp(-k * other.max);

    return new Interval(
      -Math.log(Math.max(e1min, e1max) + Math.max(e2min, e2max)) / k,
      -Math.log(Math.min(e1min, e1max) + Math.min(e2min, e2max)) / k
    );
  }

  // Math functions
  sqrt(): Interval {
    // Clamp negative values to 0 for SDF operations
    const clampedMin = Math.max(0, this.min);
    return new Interval(Math.sqrt(clampedMin), Math.sqrt(Math.max(0, this.max)));
  }

  sin(): Interval {
    // TODO: Implement proper interval arithmetic for sin
    // This is a naive implementation that works for small intervals
    const samples = 100;
    const step = (this.max - this.min) / samples;
    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i <= samples; i++) {
      const x = this.min + i * step;
      const value = Math.sin(x);
      min = Math.min(min, value);
      max = Math.max(max, value);
    }

    return new Interval(min, max);
  }

  cos(): Interval {
    // TODO: Implement proper interval arithmetic for cos
    // This is a naive implementation that works for small intervals
    const samples = 100;
    const step = (this.max - this.min) / samples;
    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i <= samples; i++) {
      const x = this.min + i * step;
      const value = Math.cos(x);
      min = Math.min(min, value);
      max = Math.max(max, value);
    }

    return new Interval(min, max);
  }

  log(): Interval {
    if (this.min <= 0) {
      throw new Error('Log of interval containing zero or negative numbers');
    }
    return new Interval(Math.log(this.min), Math.log(this.max));
  }

  exp(): Interval {
    return new Interval(Math.exp(this.min), Math.exp(this.max));
  }

  // Utility methods
  toString(): string {
    return `[${this.min}, ${this.max}]`;
  }

  // Helper to compute bounds of a set of numbers
  static bound(values: number[]): Interval {
    if (values.length === 0) throw new Error('Cannot compute bounds of empty set');
    return new Interval(Math.min(...values), Math.max(...values));
  }
}

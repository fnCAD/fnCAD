/**
 * Represents a closed interval [min, max] on the real number line
 */
export class Interval {
  constructor(
    public readonly min: number,
    public readonly max: number
  ) {
    if (min != min || max != max) {
      throw new Error(`Tried to construct nan interval`);
    }
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

  intersection(other: Interval): Interval {
    return new Interval(Math.max(this.min, other.min), Math.min(this.max, other.max));
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
      return new Interval(-Infinity, Infinity);
      // throw new Error('Division by interval containing zero');
    }
    const quotients = [
      this.min / other.min,
      this.min / other.max,
      this.max / other.min,
      this.max / other.max,
    ];
    return new Interval(Math.min(...quotients), Math.max(...quotients));
  }

  merge(other: Interval): Interval {
    return new Interval(Math.min(this.min, other.min), Math.max(this.max, other.max));
  }

  below(value: number): Interval {
    if (!this.contains(value)) {
      throw new Error(`range ${this} does not contain ${value}, can't go below.`);
    }
    return new Interval(this.min, value);
  }

  above(value: number): Interval {
    if (!this.contains(value)) {
      throw new Error(`range ${this} does not contain ${value}, can't go above.`);
    }
    return new Interval(value, this.max);
  }

  // Unary operations
  negate(): Interval {
    return new Interval(-this.max, -this.min);
  }

  size(): number {
    return this.max - this.min;
  }

  // Special SDF operations

  static smooth_union(intervals: Interval[], radius: number): Interval {
    // For points far from both shapes (> 5*radius), just use regular min.
    const limit = 5 * radius;
    const smooth_zone = new Interval(-limit, limit);
    const smoothParts = intervals
      .filter((i) => i.intersects(smooth_zone))
      .map((i) => i.intersection(smooth_zone));
    if (smoothParts.length === 0) {
      // All totally outside the smooth zone - we can just use min for both.
      return new Interval(
        Math.min(...intervals.map((i) => i.min)),
        Math.min(...intervals.map((i) => i.max))
      );
    }
    // so now we know at least some intervals overlap the smooth zone.
    // precompute the bounded interval for the parts that do
    const k = Interval.from(-1 / radius);
    let sumExp = smoothParts[0].multiply(k).exp();
    for (let i = 1; i < smoothParts.length; i++) {
      sumExp = sumExp.add(smoothParts[i].multiply(k).exp());
    }
    const smoothInterval = sumExp.log().multiply(Interval.from(-radius));
    var min = smoothInterval.min,
      max = smoothInterval.max;

    // These adjustments help correct for extreme values produced by the log/exp logic.
    // if any intervals stretch below -limit, use plain min() for the lower limit.
    if (intervals.some((i) => i.min < -limit)) {
      min = Math.min(...intervals.map((i) => i.min));
      if (intervals.some((i) => i.max < -limit)) {
        max = Math.min(...intervals.map((i) => i.max));
      } else {
        // ensure the approximation doesn't break Interval semantics.
        max = Math.min(max, min);
      }
    }
    // if *all* are above limit, use plain min() for the max.
    if (intervals.every((i) => i.max > limit)) {
      max = Math.min(...intervals.map((i) => i.max));
      if (intervals.every((i) => i.min > limit)) {
        min = Math.min(...intervals.map((i) => i.min));
      }
    }
    return new Interval(min, max);
  }

  // minimum distance to number
  minDist(value: number): number {
    if (value < this.min) return this.min - value;
    if (value > this.max) return value - this.max;
    return 0;
  }

  // Math functions
  sqr(): Interval {
    // If interval contains zero, minimum is 0
    if (this.min <= 0 && this.max >= 0) {
      return new Interval(0, Math.max(this.min * this.min, this.max * this.max));
    }
    // Otherwise min is the square of whichever endpoint is closer to zero
    return new Interval(
      Math.min(this.min * this.min, this.max * this.max),
      Math.max(this.min * this.min, this.max * this.max)
    );
  }

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
    if (step == Infinity) return new Interval(-Infinity, Infinity);
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
    if (step == Infinity) return new Interval(-Infinity, Infinity);
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

  // Helper to compute min of intervals
  static min(...intervals: Interval[]): Interval {
    if (intervals.length === 0) throw new Error('Cannot compute min of empty set');
    return new Interval(
      Math.min(...intervals.map((i) => i.min)),
      Math.min(...intervals.map((i) => i.max))
    );
  }

  // Helper to compute max of intervals
  static max(...intervals: Interval[]): Interval {
    if (intervals.length === 0) throw new Error('Cannot compute max of empty set');
    return new Interval(
      Math.max(...intervals.map((i) => i.min)),
      Math.max(...intervals.map((i) => i.max))
    );
  }
}

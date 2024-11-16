export type Vec3 = [number, number, number];

export interface SDF {
  evaluate: (p: Vec3) => number;
}

export function sphere(radius: number = 1): SDF {
  return {
    evaluate: ([x, y, z]) => Math.sqrt(x*x + y*y + z*z) - radius
  };
}

// Combining operations
export function union(a: SDF, b: SDF): SDF {
  return {
    evaluate: (p: Vec3) => Math.min(a.evaluate(p), b.evaluate(p))
  };
}

export function intersection(a: SDF, b: SDF): SDF {
  return {
    evaluate: (p: Vec3) => Math.max(a.evaluate(p), b.evaluate(p))
  };
}

export function difference(a: SDF, b: SDF): SDF {
  return {
    evaluate: (p: Vec3) => Math.max(a.evaluate(p), -b.evaluate(p))
  };
}

// Helper for creating a floor plane at y=height
export function floor(height: number = 0): SDF {
  return {
    evaluate: ([x, y, z]) => y - height
  };
}

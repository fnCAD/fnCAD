export type Vec3 = [number, number, number];

export interface SDF {
  evaluate: (p: Vec3) => number;
}

export function sphere(radius: number = 1): SDF {
  return {
    evaluate: ([x, y, z]) => Math.sqrt(x*x + y*y + z*z) - radius
  };
}

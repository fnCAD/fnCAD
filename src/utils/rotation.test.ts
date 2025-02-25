import { describe, it, expect } from 'vitest';
import { RotationUtils } from './rotation';
import * as THREE from 'three';
import { Interval } from '../interval';

describe('RotationUtils', () => {
  it('creates consistent rotation matrices', () => {
    const matrix = RotationUtils.createRotationMatrix(Math.PI / 2, 0, 0);

    // Test rotating a point along the X axis
    const point = new THREE.Vector3(0, 1, 0);
    const rotated = point.clone().applyMatrix4(matrix);

    // After 90 degrees around X, (0,1,0) should become approximately (0,0,1)
    expect(rotated.x).toBeCloseTo(0);
    expect(rotated.y).toBeCloseTo(0);
    expect(rotated.z).toBeCloseTo(1);
  });

  it('rotates points correctly', () => {
    const point = new THREE.Vector3(1, 0, 0);

    // Rotate 90 degrees around Y axis
    const rotated = RotationUtils.rotatePoint(point, 0, Math.PI / 2, 0);

    // (1,0,0) rotated 90 degrees around Y should become (0,0,-1)
    expect(rotated.x).toBeCloseTo(0);
    expect(rotated.y).toBeCloseTo(0);
    expect(rotated.z).toBeCloseTo(-1);
  });

  it('rotates AABBs correctly', () => {
    const aabb = {
      min: [0, 0, 0] as [number, number, number],
      max: [1, 1, 1] as [number, number, number],
    };

    // Rotate 45 degrees around Y
    const rotated = RotationUtils.rotateAABB(aabb, 0, Math.PI / 4, 0);

    // The rotated AABB should be larger to contain the original box
    expect(rotated).toBeDefined();
    if (rotated) {
      // The X dimension expands but stays positive
      expect(rotated.min[0]).toBe(0);
      expect(rotated.max[0]).toBeGreaterThan(1);

      // The Y dimension should remain unchanged
      expect(rotated.min[1]).toBeCloseTo(0);
      expect(rotated.max[1]).toBeCloseTo(1);

      // The Z dimension rotates into the negative.
      expect(rotated.min[2]).toBeLessThan(0);
      expect(rotated.max[2]).toBeLessThan(1);
    }
  });

  it('rotates intervals correctly', () => {
    const x = new Interval(0, 1);
    const y = new Interval(0, 1);
    const z = new Interval(0, 1);

    // Rotate 90 degrees around X
    const rotated = RotationUtils.rotateIntervals(x, y, z, Math.PI / 2, 0, 0);

    // Y should map to Z and Z should map to -Y
    expect(rotated.x.min).toBeCloseTo(0);
    expect(rotated.x.max).toBeCloseTo(1);

    expect(rotated.y.min).toBeCloseTo(-1);
    expect(rotated.y.max).toBeCloseTo(0);

    expect(rotated.z.min).toBeCloseTo(0);
    expect(rotated.z.max).toBeCloseTo(1);
  });
});

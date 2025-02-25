import * as THREE from 'three';
import { Interval } from '../interval';

/**
 * Unified rotation utility for consistent rotation behavior across the application.
 * This centralizes rotation logic that was previously duplicated in multiple files.
 * TODO: combine these methods further.
 */
export class RotationUtils {
  /**
   * Creates a rotation matrix from Euler angles
   * @param rx Rotation around X axis in radians
   * @param ry Rotation around Y axis in radians
   * @param rz Rotation around Z axis in radians
   * @returns THREE.Matrix4 rotation matrix
   */
  static createRotationMatrix(rx: number, ry: number, rz: number): THREE.Matrix4 {
    const rotMatrix = new THREE.Matrix4();
    // We use 'ZYX' order for matrix construction because matrix multiplication
    // applies transforms from right to left. This results in the same point
    // transformations as applying rotations in XYZ order.
    rotMatrix.makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'ZYX'));
    return rotMatrix;
  }

  /**
   * Rotates a point using the given rotation angles
   * @param point Point to rotate
   * @param rx Rotation around X axis in radians
   * @param ry Rotation around Y axis in radians
   * @param rz Rotation around Z axis in radians
   * @returns Rotated point
   */
  static rotatePoint(point: THREE.Vector3, rx: number, ry: number, rz: number): THREE.Vector3 {
    const matrix = this.createRotationMatrix(rx, ry, rz);
    return point.clone().applyMatrix4(matrix);
  }

  /**
   * Rotates an axis-aligned bounding box
   * @param bounds AABB to rotate, or undefined
   * @param rx Rotation around X axis in radians
   * @param ry Rotation around Y axis in radians
   * @param rz Rotation around Z axis in radians
   * @returns Rotated AABB that contains the original AABB, or undefined if input is undefined
   */
  static rotateAABB(
    bounds:
      | { min: readonly [number, number, number]; max: readonly [number, number, number] }
      | undefined,
    rx: number,
    ry: number,
    rz: number
  ): { min: [number, number, number]; max: [number, number, number] } | undefined {
    if (bounds === undefined) return;

    // Get all 8 corners of the AABB
    const corners: [number, number, number][] = [
      [bounds.min[0], bounds.min[1], bounds.min[2]],
      [bounds.min[0], bounds.min[1], bounds.max[2]],
      [bounds.min[0], bounds.max[1], bounds.min[2]],
      [bounds.min[0], bounds.max[1], bounds.max[2]],
      [bounds.max[0], bounds.min[1], bounds.min[2]],
      [bounds.max[0], bounds.min[1], bounds.max[2]],
      [bounds.max[0], bounds.max[1], bounds.min[2]],
      [bounds.max[0], bounds.max[1], bounds.max[2]],
    ];

    // Compute trig values
    const cx = Math.cos(rx),
      sx = Math.sin(rx);
    const cy = Math.cos(ry),
      sy = Math.sin(ry);
    const cz = Math.cos(rz),
      sz = Math.sin(rz);

    // Rotate each corner
    const rotated = corners.map(([x, y, z]) => {
      // First rotate around X
      const x1 = x;
      const y1 = y * cx - z * sx;
      const z1 = y * sx + z * cx;

      // Then around Y
      const x2 = x1 * cy + z1 * sy;
      const y2 = y1;
      const z2 = -x1 * sy + z1 * cy;

      // Finally around Z
      const nx = x2 * cz - y2 * sz;
      const ny = x2 * sz + y2 * cz;
      const nz = z2;

      return [nx, ny, nz] as [number, number, number];
    });

    // Find new min/max
    const min: [number, number, number] = [
      Math.min(...rotated.map((p) => p[0])),
      Math.min(...rotated.map((p) => p[1])),
      Math.min(...rotated.map((p) => p[2])),
    ];
    const max: [number, number, number] = [
      Math.max(...rotated.map((p) => p[0])),
      Math.max(...rotated.map((p) => p[1])),
      Math.max(...rotated.map((p) => p[2])),
    ];

    return { min, max };
  }

  /**
   * Rotates intervals representing a box in 3D space
   * @param x X interval
   * @param y Y interval
   * @param z Z interval
   * @param rx Rotation around X axis in radians
   * @param ry Rotation around Y axis in radians
   * @param rz Rotation around Z axis in radians
   * @returns Rotated intervals
   */
  static rotateIntervals(
    x: Interval,
    y: Interval,
    z: Interval,
    rx: number,
    ry: number,
    rz: number
  ): { x: Interval; y: Interval; z: Interval } {
    // Compute trig values
    const cx = Math.cos(rx),
      sx = Math.sin(rx);
    const cy = Math.cos(ry),
      sy = Math.sin(ry);
    const cz = Math.cos(rz),
      sz = Math.sin(rz);

    let minX = Number.MAX_VALUE,
      maxX = -Number.MAX_VALUE;
    let minY = Number.MAX_VALUE,
      maxY = -Number.MAX_VALUE;
    let minZ = Number.MAX_VALUE,
      maxZ = -Number.MAX_VALUE;

    // Transform each corner of the box
    for (let iz = 0; iz < 2; iz++) {
      for (let iy = 0; iy < 2; iy++) {
        for (let ix = 0; ix < 2; ix++) {
          const px = ix === 0 ? x.min : x.max;
          const py = iy === 0 ? y.min : y.max;
          const pz = iz === 0 ? z.min : z.max;

          // First rotate around X
          const rx1 = px;
          const ry1 = py * cx - pz * sx;
          const rz1 = py * sx + pz * cx;

          // Then around Y
          const rx2 = rx1 * cy + rz1 * sy;
          const ry2 = ry1;
          const rz2 = -rx1 * sy + rz1 * cy;

          // Finally around Z
          const rx3 = rx2 * cz - ry2 * sz;
          const ry3 = rx2 * sz + ry2 * cz;
          const rz3 = rz2;

          minX = rx3 < minX ? rx3 : minX;
          minY = ry3 < minY ? ry3 : minY;
          minZ = rz3 < minZ ? rz3 : minZ;
          maxX = rx3 > maxX ? rx3 : maxX;
          maxY = ry3 > maxY ? ry3 : maxY;
          maxZ = rz3 > maxZ ? rz3 : maxZ;
        }
      }
    }

    return {
      x: new Interval(minX, maxX),
      y: new Interval(minY, maxY),
      z: new Interval(minZ, maxZ),
    };
  }
}

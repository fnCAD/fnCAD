import { Interval } from '../interval';
import { GLSLContext } from './glslgen';
import { Vector3 } from 'three';

export type Content = null | {
  category: 'face' | 'edge' | 'outside' | 'inside',
};

export interface Node {
  /**
   * Direct SDF evaluation at a single point.
   * Returns the signed distance from the point to the surface.
   * Used to compute gradient during mesh optimization.
   */
  evaluate(point: Vector3): number;

  /**
   * Returns a string that evaluates using the provided coordinate variable names.
   * Each name will be suffixed with the depth number to avoid scope conflicts.
   * Optimization of `evaluate()` for inlining.
   */
  evaluateStr(xname: string, yname: string, zname: string, depth: number): string;

  /**
   * Interval arithmetic evaluation over a box-shaped region.
   * Returns guaranteed bounds on the SDF value within that region.
   * Can not take advantage of AABBs!
   * Used for:
   * - Octree subdivision (old approach)
   * - Ground truth for `evaluateContent`.
   */
  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval;

  /**
   * Semantic evaluation of a region's relationship to object boundaries.
   * Returns a category describing how the region intersects with object surfaces:
   * - null: Plain arithmetic, no boundary information known
   * - 'face': Contains a single known boundary surface
   * - 'edge': Contains multiple boundaries (to subdivide further)
   * - 'outside': Completely outside the node
   * - 'inside': Completely inside the node
   * Used to subdivide the octree (new approach).
   */
  evaluateContent(x: Interval, y: Interval, z: Interval): Content;

  /**
   * Generates GLSL code for evaluating this node in a shader.
   * Returns a string containing the variable name holding the result.
   * Used for the real-time ray marching shader.
   */
  toGLSL(context: GLSLContext): string;
}

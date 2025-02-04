import { Interval } from '../interval';
import { GLSLContext } from './glslgen';

export type Content = null | {
  category: 'face' | 'complex' | 'outside' | 'inside';
  node?: Node; // Only set for 'face' and 'complex' categories
  sdfEstimate: Interval; // The SDF value range in this region
  minSize?: number; // Minimum feature size, required for 'face' and 'complex'
};

export abstract class Node {
  abstract evaluate: (x: number, y: number, z: number) => number;

  // must be set in leaf child constructor
  compileEvaluate(): (x: number, y: number, z: number) => number {
    return new Function('x', 'y', 'z', `return ${this.evaluateStr('x', 'y', 'z', 0)};`) as (
      x: number,
      y: number,
      z: number
    ) => number;
  }

  /**
   * Direct SDF evaluation at a single point.
   * Returns the signed distance from the point to the surface.
   * Used to compute gradient during mesh optimization.
   * As an inlining optimization, this returns a code string instead.
   * It must be evaluated in a function defining `xname`, `yname`, `zname` as parameters.
   */
  abstract evaluateStr(xname: string, yname: string, zname: string, depth: number): string;

  /**
   * Interval arithmetic evaluation over a box-shaped region.
   * Returns guaranteed bounds on the SDF value within that region.
   * Can not take advantage of AABBs!
   * Used for:
   * - Octree subdivision (old approach)
   * - Ground truth for `evaluateContent`.
   */
  abstract evaluateInterval(x: Interval, y: Interval, z: Interval): Interval;

  /**
   * Semantic evaluation of a region's relationship to object boundaries.
   * Returns a category describing how the region intersects with object surfaces:
   * - null: Plain arithmetic, no boundary information known
   * - 'face': Contains a single known boundary surface
   * - 'complex': Contains multiple boundaries or ambiguous proximity (subdivide further)
   * - 'outside': Completely outside the node
   * - 'inside': Completely inside the node
   * Used to subdivide the octree (new approach).
   */
  abstract evaluateContent(x: Interval, y: Interval, z: Interval): Content;

  /**
   * Generates GLSL code for evaluating this node in a shader.
   * Returns a string containing the variable name holding the result.
   * Used for the real-time ray marching shader.
   */
  abstract toGLSL(context: GLSLContext): string;
}

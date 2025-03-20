import {
  Node,
  ModuleCall,
  ModuleDeclaration,
  Context,
  Value,
  Identifier,
  SDFExpression,
  SDFExpressionNode,
  isSDFExpression,
  isSDFGroup,
  Expression,
  BinaryExpression,
  UnaryExpression,
  VectorLiteral,
  SourceLocation,
  IndexExpression,
  VariableDeclaration,
  ForLoop,
  AssignmentStatement,
  IfStatement,
  AABB,
  AssertStatement,
  SDFScene,
} from './types';

export type EvalResult = number | number[];
import { parseError } from './errors';

function checkVector(value: any, requiredSize: number, location: SourceLocation): number[] {
  if (!Array.isArray(value)) {
    throw parseError(`Expected vector argument, got ${typeof value}`, location);
  }
  if (!value.every((x) => typeof x === 'number')) {
    throw parseError(`Vector components must be numbers`, location);
  }
  if (value.length !== requiredSize) {
    throw parseError(`Expected ${requiredSize}D vector, got ${value.length}D`, location);
  }
  return value;
}

// Export evalExpression so it can be used by types.ts
export function evalExpression(expr: Expression, context: Context): EvalResult {
  if ('value' in expr && typeof expr.value === 'number') {
    return expr.value;
  }
  if (expr instanceof Identifier) {
    const value = context.get(expr.name);
    if (value === undefined) {
      throw parseError(`Undefined variable: ${expr.name}`, expr.location);
    }
    if (typeof value !== 'number') {
      throw parseError(`Variable ${expr.name} is not a number`, expr.location);
    }
    return value;
  }
  if (expr instanceof UnaryExpression) {
    const operand = evalExpression(expr.operand, context);

    if (typeof operand !== 'number') {
      throw new Error('Unary operations require number operands');
    }

    switch (expr.operator) {
      case '-':
        return -operand;
    }
  }
  if (expr instanceof BinaryExpression) {
    const left = evalExpression(expr.left, context);
    const right = evalExpression(expr.right, context);

    // Both operands must be numbers for arithmetic
    if (typeof left !== 'number' || typeof right !== 'number') {
      throw new Error('Arithmetic operations require number operands');
    }

    switch (expr.operator) {
      case '+':
        return left + right;
      case '-':
        return left - right;
      case '*':
        return left * right;
      case '/':
        if (right === 0) throw new Error('Division by zero');
        return left / right;
      case '==':
        return Number(left === right);
      case '!=':
        return Number(left !== right);
      case '<':
        return Number(left < right);
      case '<=':
        return Number(left <= right);
      case '>':
        return Number(left > right);
      case '>=':
        return Number(left >= right);
      case '&&':
        return left !== 0 && right !== 0 ? 1 : 0;
      case '||':
        return left !== 0 || right !== 0 ? 1 : 0;
    }
  }
  if (expr instanceof VectorLiteral) {
    return expr.evaluate(context);
  }
  if (expr instanceof IndexExpression) {
    const array = evalExpression(expr.array, context);
    const index = evalExpression(expr.index, context);

    if (!Array.isArray(array)) {
      throw parseError('Cannot index non-array value', expr.location);
    }
    if (typeof index !== 'number' || !Number.isInteger(index)) {
      throw parseError('Array index must be an integer', expr.location);
    }
    if (index < 0 || index >= array.length) {
      throw parseError(
        `Array index ${index} out of bounds [0..${array.length - 1}]`,
        expr.location
      );
    }

    return array[index];
  }
  throw new Error(`Unsupported expression type: ${expr.constructor.name}`);
}

// Evaluate OpenSCAD-style AST to produce values (numbers or SDF expressions)
// Returns undefined for statements that don't produce values (like module declarations)
/**
 * Helper functions for handling SDF children
 *
 * Module handler checklist for conversion:
 * [x] smooth_union
 * [x] smooth_intersection
 * [x] smooth_difference
 * [x] cube (no children)
 * [x] sphere (no children)
 * [x] cylinder (no children)
 * [x] translate
 * [x] rotate
 * [x] scale
 * [x] union
 * [x] difference
 * [x] custom modules
 */

export function flattenScope(
  nodes: Node[],
  context: Context,
  name: string,
  location: SourceLocation
): SDFExpression[] {
  const results: SDFExpression[] = [];

  // Create new scope for evaluating children
  const childScope = context.child();

  for (const node of nodes) {
    const result = evalCAD(node, childScope);

    // Skip undefined results (like module declarations)
    if (result === undefined) continue;

    if (isSDFGroup(result)) {
      results.push(...result.expressions);
    } else if (isSDFExpression(result)) {
      results.push(result);
    } else {
      throw parseError(`${name} requires SDF children`, location);
    }
  }

  return results;
}

export function wrapUnion(expressions: SDFExpression[]): SDFExpression {
  if (expressions.length === 0) {
    return {
      type: 'sdf',
      expr: '0',
      bounds: {
        min: [0, 0, 0],
        max: [-1, -1, -1],
      },
    };
  }
  if (expressions.length === 1) {
    return expressions[0];
  }

  const bounds = combineAABBs(expressions);
  const expr = `min(${expressions.map((e) => e.expr).join(', ')})`;

  if (!bounds) return { type: 'sdf', expr };

  return {
    type: 'sdf',
    expr:
      `aabb(${bounds.min[0]}, ${bounds.min[1]}, ${bounds.min[2]}, ` +
      `${bounds.max[0]}, ${bounds.max[1]}, ${bounds.max[2]}, ` +
      `${expr})`,
    bounds,
  };
}

export function evalCAD(node: Node, context: Context): Value | undefined {
  if (node instanceof ModuleDeclaration) {
    context.defineModule(node.name, node);
    return undefined;
  }
  if (node instanceof ModuleCall) {
    return evalModuleCall(node, context);
  }
  if (node instanceof VariableDeclaration) {
    const value = evalExpression(node.initializer, context);
    context.set(node.name, value);
    return undefined;
  }
  if (node instanceof AssignmentStatement) {
    const value = evalExpression(node.value, context);
    if (!context.assign(node.name, value)) {
      throw parseError(`Undefined variable: ${node.name}`, node.location);
    }
    return undefined;
  }
  if (node instanceof IfStatement) {
    const condition = evalExpression(node.condition, context);
    if (typeof condition !== 'number') {
      throw parseError('If condition must evaluate to a number', node.location);
    }

    // Any non-zero value is considered true
    if (condition !== 0) {
      return {
        type: 'group',
        expressions: flattenScope(node.thenBranch, context, 'if branch', node.location),
      };
    } else if (node.elseBranch) {
      return {
        type: 'group',
        expressions: flattenScope(node.elseBranch, context, 'else branch', node.location),
      };
    }
    return { type: 'group', expressions: [] };
  }

  if (node instanceof ForLoop) {
    const start = evalExpression(node.range.start, context);
    const end = evalExpression(node.range.end, context);
    const step = node.range.step ? evalExpression(node.range.step, context) : 1;

    if (typeof start !== 'number' || typeof end !== 'number' || typeof step !== 'number') {
      throw parseError('For loop range must evaluate to numbers', node.location);
    }

    if (step === 0) {
      throw parseError('For loop step cannot be zero', node.location);
    }

    // Create new scope for loop variable
    const loopContext = context.child();
    const results: SDFExpression[] = [];

    // Adjust the for loop based on step direction
    if (step > 0) {
      for (let i = start; i <= end; i += step) {
        loopContext.set(node.variable, i);
        // Evaluate body statements
        results.push(...flattenScope(node.body, loopContext, 'for loop', node.location));
      }
    } else {
      for (let i = start; i >= end; i += step) {
        loopContext.set(node.variable, i);
        // Evaluate body statements
        results.push(...flattenScope(node.body, loopContext, 'for loop', node.location));
      }
    }

    return {
      type: 'group',
      expressions: results,
    };
  }
  if (node instanceof AssertStatement) {
    const condition = evalExpression(node.condition, context);
    if (typeof condition !== 'number') {
      throw parseError('Assert condition must evaluate to a number', node.location);
    }
    if (condition === 0) {
      const message = node.message || 'Assertion failed';
      throw parseError(`Assertion failed: ${message}`, node.location);
    }
    return undefined;
  }
  if (node instanceof SDFExpressionNode) {
    return {
      type: 'sdf',
      expr: node.expression,
    };
  }
  if (node instanceof Expression) {
    return evalExpression(node, context);
  }
  throw new Error(`Cannot evaluate node type: ${node.constructor.name}`);
}

export function moduleToSDF(nodes: Node[]): SDFScene {
  const context = new Context();
  context.set('$maxerror', 0.01);
  const result = wrapUnion(
    flattenScope(nodes, context, 'toplevel', {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
      source: '',
    })
  );

  // Get mesh settings from context, defaulting if not set
  const maxError = context.get('$maxerror') as number;

  return new SDFScene(result.expr, maxError);
}

function evalModuleCall(call: ModuleCall, context: Context): SDFExpression {
  const evalArg = (idx: number, defaultVal: number = 0): EvalResult => {
    const arg = call.args[idx.toString()];
    if (!arg) return defaultVal;
    const val = evalExpression(arg, context);
    if (Array.isArray(val) || typeof val === 'number') return val;
    throw parseError(`Expected number or vector argument, got ${typeof val}`, arg.location);
  };

  switch (call.name) {
    case 'smooth_union': {
      if (!call.children?.length) {
        throw parseError('smooth_union requires at least one child node', call.location);
      }
      const radius = evalArg(0, 0.5);
      if (typeof radius !== 'number') {
        throw parseError('smooth_union radius must be a number', call.location);
      }

      const children = flattenScope(call.children, context, 'smooth_union', call.location);

      return {
        type: 'sdf',
        expr: smooth_union(
          radius,
          children.map((c) => c.expr)
        ),
        bounds: growAABB(combineAABBs(children), radius),
      };
    }

    case 'smooth_intersection': {
      if (!call.children?.length) {
        throw parseError('smooth_intersection requires at least one child node', call.location);
      }
      const radius = evalArg(0, 0.5);
      if (typeof radius !== 'number') {
        throw parseError('smooth_intersection radius must be a number', call.location);
      }

      const children = flattenScope(call.children, context, 'smooth_intersection', call.location);
      // For smooth_intersection, take most restrictive bounds from all children with bounds
      const childBounds = children
        .map((c) => c.bounds)
        .filter((b): b is NonNullable<typeof b> => b !== undefined);
      const bounds =
        childBounds.length > 0
          ? {
              min: [
                Math.max(...childBounds.map((b) => b.min[0])),
                Math.max(...childBounds.map((b) => b.min[1])),
                Math.max(...childBounds.map((b) => b.min[2])),
              ] as [number, number, number],
              max: [
                Math.min(...childBounds.map((b) => b.max[0])),
                Math.min(...childBounds.map((b) => b.max[1])),
                Math.min(...childBounds.map((b) => b.max[2])),
              ] as [number, number, number],
            }
          : undefined;
      return {
        type: 'sdf',
        expr: smooth_intersection(
          children.map((c) => c.expr),
          radius
        ),
        bounds,
      };
    }

    case 'smooth_difference': {
      if (!call.children?.length) {
        throw parseError('smooth_difference requires at least one child node', call.location);
      }
      const radius = evalArg(0, 0.5);
      if (typeof radius !== 'number') {
        throw parseError('smooth_difference radius must be a number', call.location);
      }

      const children = flattenScope(call.children, context, 'smooth_difference', call.location);

      // For smooth difference, we need to grow the first shape's bounds by the blend radius
      const bounds = growAABB(children[0].bounds, radius);

      return {
        type: 'sdf',
        expr: smooth_difference(
          children.map((c) => c.expr),
          radius
        ),
        bounds,
      };
    }
    case 'cube': {
      const sizeArg = evalArg(0, 1);
      let sizes: number[];

      if (typeof sizeArg === 'number') {
        sizes = [sizeArg, sizeArg, sizeArg];
      } else if (Array.isArray(sizeArg) && sizeArg.length === 3) {
        sizes = sizeArg;
      } else {
        throw parseError('cube size must be a number or [x,y,z] vector', call.location);
      }

      if (call.children?.length) {
        throw parseError('cube does not accept children', call.location);
      }

      const halfSizes = sizes.map((s) => s / 2);
      // For flat surfaces, use 1/4 of the smallest dimension as minSize
      const minSize = Math.min(...sizes) * 0.25;
      return {
        type: 'sdf',
        expr: `max(max(face(abs(x) - ${halfSizes[0]}, ${minSize}), face(abs(y) - ${halfSizes[1]}, ${minSize})), face(abs(z) - ${halfSizes[2]}, ${minSize}))`,
        bounds: {
          min: [-halfSizes[0], -halfSizes[1], -halfSizes[2]],
          max: [halfSizes[0], halfSizes[1], halfSizes[2]],
        },
      };
    }

    case 'sphere': {
      const r = evalArg(0, 1);
      if (typeof r !== 'number') {
        throw parseError('sphere radius must be a number', call.location);
      }

      if (call.children?.length) {
        throw parseError('sphere does not accept children', call.location);
      }

      // For spherical surfaces, use 1/4 of the radius as minSize
      const minSize = r * 0.25;
      return {
        type: 'sdf',
        expr: `face(sqrt(x*x + y*y + z*z) - ${r}, ${minSize})`,
        bounds: {
          min: [-r, -r, -r],
          max: [r, r, r],
        },
      };
    }

    case 'cylinder': {
      const radius = evalArg(0, 0.5);
      const height = evalArg(1, 1);
      if (typeof radius !== 'number' || typeof height !== 'number') {
        throw parseError('cylinder radius and height must be numbers', call.location);
      }

      if (call.children?.length) {
        throw parseError('cylinder does not accept children', call.location);
      }

      const halfHeight = height / 2;
      // For cylindrical surfaces, use 1/4 of radius for curved surface and 1/4 of height for flat ends
      const curvedMinSize = radius * 0.25;
      const flatMinSize = height * 0.25;
      return {
        type: 'sdf',
        expr: `max(face(sqrt(x*x + z*z) - ${radius}, ${curvedMinSize}), face(abs(y) - ${halfHeight}, ${flatMinSize}))`,
        bounds: {
          min: [-radius, -halfHeight, -radius],
          max: [radius, halfHeight, radius],
        },
      };
    }

    case 'cone': {
      const radius = evalArg(0, 0.5);
      const height = evalArg(1, 1);
      if (typeof radius !== 'number' || typeof height !== 'number') {
        throw parseError('cone radius and height must be numbers', call.location);
      }

      if (call.children?.length) {
        throw parseError('cone does not accept children', call.location);
      }

      const halfHeight = height / 2;
      // For conical surface, use 1/4 of base radius
      const curvedMinSize = radius * 0.25;
      const flatMinSize = height * 0.25;

      // Cone SDF formula with aspect ratio correction:
      // Basic cone formula: length(xz) * (h/2 + y)/h - r * (h/2 + y)/h
      // Add correction factor based on height/radius ratio to maintain precision
      const aspectRatio = height / (2 * radius);
      const correction = Math.min(1, Math.sqrt(aspectRatio));

      return {
        type: 'sdf',
        expr: `max(
          face(
            ${correction} * (sqrt(x*x + z*z) - ${radius} * (${halfHeight} + y)/${height}),
            ${curvedMinSize}
          ),
          face(abs(y) - ${halfHeight}, ${flatMinSize})
        )`,
        bounds: {
          min: [-radius, -halfHeight, -radius],
          max: [radius, halfHeight, radius],
        },
      };
    }

    case 'translate': {
      const vec = checkVector(evalArg(0), 3, call.location);
      const [dx, dy, dz] = vec;

      const children = flattenScope(call.children, context, 'translate', call.location);
      if (children.length === 0) {
        throw parseError('translate requires at least one child', call.location);
      }

      const childExpr = wrapUnion(children);
      let bounds = undefined;
      if (childExpr.bounds) {
        const min: [number, number, number] = [
          childExpr.bounds.min[0] + dx,
          childExpr.bounds.min[1] + dy,
          childExpr.bounds.min[2] + dz,
        ];
        const max: [number, number, number] = [
          childExpr.bounds.max[0] + dx,
          childExpr.bounds.max[1] + dy,
          childExpr.bounds.max[2] + dz,
        ];
        bounds = { min, max };
      }

      return {
        type: 'sdf',
        expr: `translate(${dx}, ${dy}, ${dz}, ${childExpr.expr})`,
        bounds,
      };
    }

    case 'rotate': {
      const vec = checkVector(evalArg(0), 3, call.location);
      // Convert degrees to radians
      const [rx, ry, rz] = vec.map((deg) => (deg * Math.PI) / 180);

      const children = flattenScope(call.children, context, 'rotate', call.location);
      if (children.length === 0) {
        throw parseError('rotate requires at least one child', call.location);
      }

      const childExpr = wrapUnion(children);
      return {
        type: 'sdf',
        expr: `rotate(${rx}, ${ry}, ${rz}, ${childExpr.expr})`,
        // Negation experimentally determined. Why? Because fuck you that's why.
        bounds: rotateAABB(childExpr.bounds, -rx, -ry, -rz),
      };
    }

    case 'scale': {
      const vec = checkVector(evalArg(0), 3, call.location);
      const [sx, sy, sz] = vec;

      const children = flattenScope(call.children, context, 'scale', call.location);
      if (children.length === 0) {
        throw parseError('scale requires at least one child', call.location);
      }

      const childExpr = wrapUnion(children);
      let bounds = undefined;
      if (childExpr.bounds) {
        // For each component, multiply by scale factor and swap if negative
        const [minX, minY, minZ] = childExpr.bounds.min;
        const [maxX, maxY, maxZ] = childExpr.bounds.max;
        bounds = {
          min: [
            sx >= 0 ? minX * sx : maxX * sx,
            sy >= 0 ? minY * sy : maxY * sy,
            sz >= 0 ? minZ * sz : maxZ * sz,
          ] as [number, number, number],
          max: [
            sx >= 0 ? maxX * sx : minX * sx,
            sy >= 0 ? maxY * sy : minY * sy,
            sz >= 0 ? maxZ * sz : minZ * sz,
          ] as [number, number, number],
        };
      }

      return {
        type: 'sdf',
        expr: `(scale(${sx}, ${sy}, ${sz}, ${childExpr.expr}) * ${Math.min(sx, sy, sz)})`,
        bounds,
      };
    }

    case 'union': {
      if (!call.children?.length) {
        return { type: 'sdf', expr: '0' };
      }
      const children = flattenScope(call.children, context, 'union', call.location);
      return wrapUnion(children);
    }

    case 'detailed': {
      if (!call.children?.length) {
        throw parseError('detailed requires at least one child', call.location);
      }
      const size = evalArg(0, 0.1);
      if (typeof size !== 'number') {
        throw parseError('detailed size must be a number', call.location);
      }

      const children = flattenScope(call.children, context, 'detailed', call.location);
      const childExpr = wrapUnion(children);
      return {
        type: 'sdf',
        expr: `detailed(${size}, ${childExpr.expr})`,
        bounds: childExpr.bounds,
      };
    }

    case 'difference': {
      if (!call.children?.length) {
        throw parseError('difference requires at least one child', call.location);
      }
      const children = flattenScope(call.children, context, 'difference', call.location);
      if (children.length === 0) {
        throw parseError('difference requires at least one child', call.location);
      }

      // First child is the base shape, remaining children are subtracted
      const base = children[0];
      const negatedChildren = children.slice(1).map((c) => `-(${c.expr})`);

      // For difference, we keep the first child's bounds since that's the maximum possible extent
      const bounds = base.bounds;

      const expr = `max(${base.expr}, ${negatedChildren.join(', ')})`;

      if (!bounds) return { type: 'sdf', expr };

      return {
        type: 'sdf',
        expr:
          `aabb(${bounds.min[0]}, ${bounds.min[1]}, ${bounds.min[2]}, ` +
          `${bounds.max[0]}, ${bounds.max[1]}, ${bounds.max[2]}, ` +
          `${expr})`,
        bounds,
      };
    }

    case 'intersection': {
      if (!call.children?.length) {
        throw parseError('intersection requires at least one child', call.location);
      }
      const children = flattenScope(call.children, context, 'intersection', call.location);
      if (children.length === 0) {
        throw parseError('intersection requires at least one child', call.location);
      }

      // For intersection, take most restrictive bounds from all children with bounds
      const childBounds = children
        .map((c) => c.bounds)
        .filter((b): b is NonNullable<typeof b> => b !== undefined);
      const bounds =
        childBounds.length > 0
          ? {
              min: [
                Math.max(...childBounds.map((b) => b.min[0])),
                Math.max(...childBounds.map((b) => b.min[1])),
                Math.max(...childBounds.map((b) => b.min[2])),
              ] as [number, number, number],
              max: [
                Math.min(...childBounds.map((b) => b.max[0])),
                Math.min(...childBounds.map((b) => b.max[1])),
                Math.min(...childBounds.map((b) => b.max[2])),
              ] as [number, number, number],
            }
          : undefined;

      const expr = `max(${children.map((c) => c.expr).join(', ')})`;

      if (!bounds) return { type: 'sdf', expr };

      return {
        type: 'sdf',
        expr:
          `aabb(${bounds.min[0]}, ${bounds.min[1]}, ${bounds.min[2]}, ` +
          `${bounds.max[0]}, ${bounds.max[1]}, ${bounds.max[2]}, ` +
          `${expr})`,
        bounds,
      };
    }

    default: {
      // Look for user-defined module with its lexical scope
      const scopedModule = context.getModule(call.name);
      if (!scopedModule) {
        throw parseError(`Unknown module: ${call.name}`, call.location);
      }

      const result = scopedModule.call(call.args, context);
      if (!isSDFExpression(result)) {
        throw parseError(`Module ${call.name} must return an SDF expression`, call.location);
      }
      return result;
    }
  }
}
// Smooth blending operations using exponential smoothing with distance threshold
export function smooth_union(radius: number, expressions: string[]): string {
  if (expressions.length === 0) return '0';
  if (expressions.length === 1) return expressions[0];
  return `smooth_union(${radius}, 50%, ${expressions.join(', ')})`;
}

export function smooth_intersection(expressions: string[], radius: number): string {
  if (expressions.length === 0) return '0';
  if (expressions.length === 1) return expressions[0];
  // Negate all expressions, apply smooth_union, then negate the result
  return `-${smooth_union(
    radius,
    expressions.map((expr) => `-(${expr})`)
  )}`;
}

export function smooth_difference(expressions: string[], radius: number): string {
  if (expressions.length === 0) return '0';
  if (expressions.length === 1) return expressions[0];

  // The first shape is the base to subtract from
  const baseExpr = expressions[0];
  // All other shapes are being subtracted
  const subtractExprs = expressions.slice(1);

  // For smooth difference, negate the base, leave the rest, apply smooth_union, negate result
  return `-${smooth_union(radius, [`-(${baseExpr})`, ...subtractExprs])}`;
}

// Helper to combine multiple AABBs into a single encompassing AABB
function combineAABBs(expressions: SDFExpression[]): AABB | undefined {
  if (!expressions.every((e) => e.bounds)) return undefined;

  return {
    min: [
      Math.min(...expressions.map((e) => e.bounds!.min[0])),
      Math.min(...expressions.map((e) => e.bounds!.min[1])),
      Math.min(...expressions.map((e) => e.bounds!.min[2])),
    ] as [number, number, number],
    max: [
      Math.max(...expressions.map((e) => e.bounds!.max[0])),
      Math.max(...expressions.map((e) => e.bounds!.max[1])),
      Math.max(...expressions.map((e) => e.bounds!.max[2])),
    ] as [number, number, number],
  };
}

// Helper to grow an AABB by a radius in all directions
function growAABB(bounds: AABB | undefined, radius: number): AABB | undefined {
  if (bounds === undefined) return;
  return {
    min: [bounds.min[0] - radius, bounds.min[1] - radius, bounds.min[2] - radius],
    max: [bounds.max[0] + radius, bounds.max[1] + radius, bounds.max[2] + radius],
  };
}

import { RotationUtils } from '../utils/rotation';

// Helper to rotate an AABB and return a new AABB that contains the rotated box
function rotateAABB(
  bounds: AABB | undefined,
  rx: number,
  ry: number,
  rz: number
): AABB | undefined {
  return RotationUtils.rotateAABB(bounds, rx, ry, rz);
}

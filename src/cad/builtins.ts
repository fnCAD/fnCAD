import { Node, ModuleCall, Context, Value, Identifier, SDFExpression, Expression, BinaryExpression } from './types';
import { parseError } from './errors';

// Evaluate OpenSCAD-style AST to produce values (numbers or SDF expressions)
export function evalCAD(node: Node, context: Context): Value {
  if (node instanceof ModuleCall) {
    return evalModuleCall(node, context);
  }
  if (node instanceof Expression) {
    return evalExpression(node, context);
  }
  throw new Error(`Cannot evaluate node type: ${node.constructor.name}`);
}

function evalExpression(expr: Expression, context: Context): number {
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
  if (expr instanceof BinaryExpression) {
    const left = evalExpression(expr.left, context);
    const right = evalExpression(expr.right, context);
    switch (expr.operator) {
      case '+': return left + right;
      case '-': return left - right;
      case '*': return left * right;
      case '/': 
        if (right === 0) throw new Error('Division by zero');
        return left / right;
    }
  }
  throw new Error(`Unsupported expression type: ${expr.constructor.name}`);
}

export function moduleToSDF(node: Node): string {
  const result = evalCAD(node, new Context());
  if (typeof result === 'number') {
    throw new Error('Expected SDF expression at top level');
  }
  return result.expr;
}

function evalModuleCall(call: ModuleCall, context: Context): SDFExpression {
  const evalArg = (idx: number, defaultVal: number = 0): number => {
    const arg = call.args[idx.toString()];
    if (!arg) return defaultVal;
    const val = evalExpression(arg, context);
    if (typeof val !== 'number') {
      throw parseError(`Expected number argument, got ${typeof val}`, arg.location);
    }
    return val;
  };

  switch (call.name) {
    case 'smooth_union': {
      if (!call.children?.length) {
        throw parseError('smooth_union requires at least one child node', call.location);
      }
      const radius = evalArg(0, 0.5);
      const results = call.children.map(c => evalCAD(c, context));
      if (results.some(r => typeof r === 'number')) {
        throw parseError('smooth_union requires SDF children', call.location);
      }
      const children = results.map(r => (r as SDFExpression).expr);
      
      // Reduce multiple children using binary smooth_union
      return {
        type: 'sdf',
        expr: children.reduce((acc, curr) => smooth_union(acc, curr, radius))
      };
    }

    case 'smooth_intersection': {
      if (!call.children?.length) {
        throw parseError('smooth_intersection requires at least one child node', call.location);
      }
      const radius = evalArg(0, 0.5);
      const results = call.children.map(c => evalCAD(c, context));
      if (results.some(r => typeof r === 'number')) {
        throw parseError('smooth_intersection requires SDF children', call.location);
      }
      const children = results.map(r => (r as SDFExpression).expr);
      
      // Reduce multiple children using binary smooth_intersection
      return {
        type: 'sdf',
        expr: children.reduce((acc, curr) => smooth_intersection(acc, curr, radius))
      };
    }

    case 'smooth_difference': {
      if (!call.children?.length) {
        throw parseError('smooth_difference requires at least one child node', call.location);
      }
      const radius = evalArg(0, 0.5);
      const results = call.children.map(c => evalCAD(c, context));
      if (results.some(r => typeof r === 'number')) {
        throw parseError('smooth_difference requires SDF children', call.location);
      }
      const children = results.map(r => (r as SDFExpression).expr);
      
      // Reduce multiple children using binary smooth_difference
      return {
        type: 'sdf',
        expr: children.reduce((acc, curr) => smooth_difference(acc, curr, radius))
      };
    }
    case 'cube': {
      const size = evalArg(0, 1);
      return {
        type: 'sdf',
        expr: `max(max(abs(x) - ${size/2}, abs(y) - ${size/2}), abs(z) - ${size/2})`
      };
    }

    case 'sphere': {
      const r = evalArg(0, 1);
      return {
        type: 'sdf',
        expr: `sqrt(x*x + y*y + z*z) - ${r}`
      };
    }

    case 'box': {
      const size = evalArg(0, 1);
      return {
        type: 'sdf',
        expr: `max(max(abs(x) - ${size/2}, abs(y) - ${size/2}), abs(z) - ${size/2})`
      };
    }

    case 'cylinder': {
      const radius = evalArg(0, 0.5);
      const height = evalArg(1, 1);
      return {
        type: 'sdf',
        expr: `max(sqrt(x*x + z*z) - ${radius}, abs(y) - ${height/2})`
      };
    }

    case 'translate': {
      const dx = evalArg(0);
      const dy = evalArg(1);
      const dz = evalArg(2);
      if (!call.children?.[0]) {
        throw parseError('translate requires a child node', call.location);
      }
      const child = evalCAD(call.children[0], context);
      if (typeof child === 'number') {
        throw parseError('translate requires an SDF child', call.location);
      }
      return {
        type: 'sdf',
        expr: `translate(${dx}, ${dy}, ${dz}, ${child.expr})`
      };
    }

    case 'rotate': {
      const rx = evalArg(0);
      const ry = evalArg(1);
      const rz = evalArg(2);
      if (!call.children?.[0]) {
        throw parseError('rotate requires a child node', call.location);
      }
      const child = evalCAD(call.children[0], context);
      if (typeof child === 'number') {
        throw parseError('rotate requires an SDF child', call.location);
      }
      return {
        type: 'sdf',
        expr: `rotate(${rx}, ${ry}, ${rz}, ${child.expr})`
      };
    }

    case 'scale': {
      const sx = evalArg(0, 1);
      const sy = evalArg(1, 1);
      const sz = evalArg(2, 1);
      if (!call.children?.[0]) {
        throw parseError('scale requires a child node', call.location);
      }
      const child = evalCAD(call.children[0], context);
      if (typeof child === 'number') {
        throw parseError('scale requires an SDF child', call.location);
      }
      return {
        type: 'sdf',
        expr: `scale(${sx}, ${sy}, ${sz}, ${child.expr})`
      };
    }

    case 'union': {
      if (!call.children?.length) {
        return { type: 'sdf', expr: '0' };
      }
      const children = call.children.map(c => {
        const result = evalCAD(c, context);
        if (typeof result === 'number') {
          throw parseError('union requires SDF children', call.location);
        }
        return result.expr;
      });
      return {
        type: 'sdf',
        expr: `min(${children.join(', ')})`
      };
    }

    case 'difference': {
      if (!call.children?.length) {
        return { type: 'sdf', expr: '0' };
      }
      const results = call.children.map(c => evalCAD(c, context));
      if (results.some(r => typeof r === 'number')) {
        throw parseError('difference requires SDF children', call.location);
      }
      const children = results.map(r => (r as SDFExpression).expr);
      const negatedChildren = children.slice(1).map(c => `-(${c})`);
      return {
        type: 'sdf',
        expr: `max(${children[0]}, ${negatedChildren.join(', ')})`
      };
    }

    default:
      throw parseError(`Unknown module: ${call.name}`, call.location);
  }
}
// Smooth blending operations using exponential smoothing with distance threshold
export function smooth_union(expr1: string, expr2: string, radius: number): string {
  return `smooth_union(${expr1}, ${expr2}, ${radius})`;
}

export function smooth_intersection(expr1: string, expr2: string, radius: number): string {
  return `-${smooth_union(`-(${expr1})`, `-(${expr2})`, radius)}`;
}

export function smooth_difference(expr1: string, expr2: string, radius: number): string {
  return `-${smooth_union(`-(${expr1})`, `${expr2}`, radius)}`;
}

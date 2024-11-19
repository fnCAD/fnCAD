import { Node, ModuleCall, Context, Value, SDFExpression, Expression, BinaryExpression } from './types';

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
      throw new Error(`Expected number argument, got ${typeof val}`);
    }
    return val;
  };

  switch (call.name) {
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

    case 'translate': {
      const dx = evalArg(0);
      const dy = evalArg(1);
      const dz = evalArg(2);
      if (!call.children?.[0]) {
        throw new Error('translate requires a child node');
      }
      const child = evalCAD(call.children[0], context);
      if (typeof child === 'number') {
        throw new Error('translate requires an SDF child');
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
        throw new Error('rotate requires a child node');
      }
      const child = evalCAD(call.children[0], context);
      if (typeof child === 'number') {
        throw new Error('rotate requires an SDF child');
      }
      return {
        type: 'sdf',
        expr: `rotate(${rx}, ${ry}, ${rz}, ${child.expr})`
      };
    }

    case 'union': {
      if (!call.children?.length) {
        return { type: 'sdf', expr: '0' };
      }
      const children = call.children.map(c => {
        const result = evalCAD(c, context);
        if (typeof result === 'number') {
          throw new Error('union requires SDF children');
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
        throw new Error('difference requires SDF children');
      }
      const children = results.map(r => (r as SDFExpression).expr);
      const negatedChildren = children.slice(1).map(c => `-(${c})`);
      return {
        type: 'sdf',
        expr: `max(${children[0]}, ${negatedChildren.join(', ')})`
      };
    }

    default:
      throw new Error(`Unknown module: ${call.name}`);
  }
}
// Smooth blending operations
export function smooth_union(expr1: string, expr2: string, radius: number): string {
  return `smooth_union(${expr1}, ${expr2}, ${radius})`;
}

export function smooth_intersection(expr1: string, expr2: string, radius: number): string {
  return `smooth_intersection(${expr1}, ${expr2}, ${radius})`;
}

export function smooth_difference(expr1: string, expr2: string, radius: number): string {
  return `smooth_difference(${expr1}, ${expr2}, ${radius})`;
}

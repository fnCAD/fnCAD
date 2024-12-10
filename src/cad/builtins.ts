import {
  Node, ModuleCall, ModuleDeclaration, Context, Value, Identifier,
  SDFExpression, isSDFExpression, Expression, BinaryExpression, VectorLiteral,
  SourceLocation,
} from './types';

export type EvalResult = number | number[];
import { parseError } from './errors';

function checkVector(value: any, requiredSize: number, location: SourceLocation): number[] {
  if (!Array.isArray(value)) {
    throw parseError(`Expected vector argument, got ${typeof value}`, location);
  }
  if (!value.every(x => typeof x === 'number')) {
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
  if (expr instanceof BinaryExpression) {
    const left = evalExpression(expr.left, context);
    const right = evalExpression(expr.right, context);
    
    // Both operands must be numbers for arithmetic
    if (typeof left !== 'number' || typeof right !== 'number') {
      throw new Error('Arithmetic operations require number operands');
    }
    
    switch (expr.operator) {
      case '+': return left + right;
      case '-': return left - right;
      case '*': return left * right;
      case '/': 
        if (right === 0) throw new Error('Division by zero');
        return left / right;
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
      throw parseError(`Array index ${index} out of bounds [0..${array.length-1}]`, expr.location);
    }
    
    return array[index];
  }
  throw new Error(`Unsupported expression type: ${expr.constructor.name}`);
}

// Evaluate OpenSCAD-style AST to produce values (numbers or SDF expressions)
// Returns undefined for statements that don't produce values (like module declarations)
function evalSDFBlock(nodes: Node[], context: Context): SDFExpression[] {
  const results: SDFExpression[] = [];
  
  for (const node of nodes) {
    const result = evalCAD(node, context);
    
    // Skip undefined results (like module declarations)
    if (result === undefined) continue;
    
    // Validate SDF type and throw location-aware error
    if (typeof result === 'number' || !('type' in result) || result.type !== 'sdf') {
      throw parseError('Expected SDF expression in block', node.location);
    }
    
    results.push(result as SDFExpression);
  }
  
  return results;
}

export function evalCAD(node: Node, context: Context): Value | undefined {
  if (node instanceof ModuleDeclaration) {
    context.defineModule(node.name, node);
    return undefined;
  }
  if (node instanceof ModuleCall) {
    return evalModuleCall(node, context);
  }
  if (node instanceof Expression) {
    return evalExpression(node, context);
  }
  throw new Error(`Cannot evaluate node type: ${node.constructor.name}`);
}

export function moduleToSDF(node: Node): string {
  const result = evalCAD(node, new Context());
  if (!result || !isSDFExpression(result)) {
    throw new Error('Expected SDF expression at top level');
  }
  return result.expr;
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
      if (typeof radius !== 'number') {
        throw parseError('smooth_intersection radius must be a number', call.location);
      }
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
      if (typeof radius !== 'number') {
        throw parseError('smooth_difference radius must be a number', call.location);
      }
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
      if (typeof size !== 'number') {
        throw parseError('cube size must be a number', call.location);
      }
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
      if (typeof size !== 'number') {
        throw parseError('box size must be a number', call.location);
      }
      return {
        type: 'sdf',
        expr: `max(max(abs(x) - ${size/2}, abs(y) - ${size/2}), abs(z) - ${size/2})`
      };
    }

    case 'cylinder': {
      const radius = evalArg(0, 0.5);
      const height = evalArg(1, 1);
      if (typeof radius !== 'number' || typeof height !== 'number') {
        throw parseError('cylinder radius and height must be numbers', call.location);
      }
      return {
        type: 'sdf',
        expr: `max(sqrt(x*x + z*z) - ${radius}, abs(y) - ${height/2})`
      };
    }

    case 'translate': {
      const vec = checkVector(evalArg(0), 3, call.location);
      const [dx, dy, dz] = vec;
      if (!call.children?.[0]) {
        throw parseError('translate requires a child node', call.location);
      }
      const child = evalCAD(call.children[0], context);
      if (!child || !isSDFExpression(child)) {
        throw parseError('translate requires an SDF expression', call.location);
      }
      return {
        type: 'sdf',
        expr: `translate(${dx}, ${dy}, ${dz}, ${child.expr})`
      };
    }

    case 'rotate': {
      const vec = checkVector(evalArg(0), 3, call.location);
      const [rx, ry, rz] = vec;
      if (!call.children?.[0]) {
        throw parseError('rotate requires a child node', call.location);
      }
      const child = evalCAD(call.children[0], context);
      if (!child || !isSDFExpression(child)) {
        throw parseError('rotate requires an SDF expression', call.location);
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
      if (typeof sx !== 'number' || typeof sy !== 'number' || typeof sz !== 'number') {
        throw parseError('scale() type error', call.location);
      }
      const child = evalCAD(call.children[0], context);
      if (!child || !isSDFExpression(child)) {
        throw parseError('scale requires an SDF expression', call.location);
      }
      return {
        type: 'sdf',
        expr: `(scale(${sx}, ${sy}, ${sz}, ${child.expr}) * ${Math.min(sx, sy, sz)})`
      };
    }

    case 'union': {
      if (!call.children?.length) {
        return { type: 'sdf', expr: '0' };
      }
      const children = evalSDFBlock(call.children, context);
      if (children.length === 0) {
        return { type: 'sdf', expr: '0' };
      }
      return {
        type: 'sdf',
        expr: `min(${children.map(c => c.expr).join(', ')})`
      };
    }

    case 'difference': {
      if (!call.children?.length) {
        return { type: 'sdf', expr: '0' };
      }
      const results = call.children.map(c => evalCAD(c, context));
      if (results.some(r => !r || !isSDFExpression(r))) {
        throw parseError('difference requires SDF children', call.location);
      }
      const children = results.map(r => (r as SDFExpression).expr);
      const negatedChildren = children.slice(1).map(c => `-(${c})`);
      return {
        type: 'sdf',
        expr: `max(${children[0]}, ${negatedChildren.join(', ')})`
      };
    }

    default: {
      // Look for user-defined module with its lexical scope
      const scopedModule = context.getModule(call.name);
      if (!scopedModule) {
        throw parseError(`Unknown module: ${call.name}`, call.location);
      }

      return scopedModule.call(call.args, context);
    }
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

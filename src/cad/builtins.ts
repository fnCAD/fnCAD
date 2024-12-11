import {
  Node, ModuleCall, ModuleDeclaration, Context, Value, Identifier,
  SDFExpression, isSDFExpression, Expression, BinaryExpression, VectorLiteral,
  SourceLocation, IndexExpression, VariableDeclaration, ForLoop,
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
/**
 * Helper functions for handling SDF children
 * 
 * Module handler checklist for conversion:
 * [x] smooth_union
 * [x] smooth_intersection 
 * [x] smooth_difference
 * [x] cube (no children)
 * [ ] sphere (no children)
 * [ ] cylinder (no children)
 * [ ] translate
 * [ ] rotate
 * [ ] scale
 * [ ] union
 * [ ] difference
 * [ ] custom modules
 */

// First step: evaluate children and ensure they're all valid SDFs
function flattenScope(nodes: Node[], context: Context, name: string, location: SourceLocation): SDFExpression[] {
  const results: SDFExpression[] = [];
  
  // Create new scope for evaluating children
  const childScope = context.child();
  
  for (const node of nodes) {
    const result = evalCAD(node, childScope);
    
    // Skip undefined results (like module declarations)
    if (result === undefined) continue;
    
    // Validate SDF type and throw location-aware error
    if (!isSDFExpression(result)) {
      throw parseError(`${name} requires SDF children`, location);
    }
    
    results.push(result);
  }
  
  return results;
}

// Second step: optionally wrap multiple SDFs in a union
function wrapUnion(expressions: SDFExpression[]): SDFExpression {
  if (expressions.length === 0) {
    return { type: 'sdf', expr: '0' };
  }
  if (expressions.length === 1) {
    return expressions[0];
  }
  return {
    type: 'sdf',
    expr: `min(${expressions.map(e => e.expr).join(', ')})`
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
  if (node instanceof ForLoop) {
    const start = evalExpression(node.range.start, context);
    const end = evalExpression(node.range.end, context);
    
    if (typeof start !== 'number' || typeof end !== 'number') {
      throw parseError('For loop range must evaluate to numbers', node.location);
    }

    // Create new scope for loop variable
    const loopContext = context.child();
    const results: SDFExpression[] = [];

    for (let i = start; i <= end; i++) {
      loopContext.set(node.variable, i);
      // Evaluate body statements
      for (const stmt of node.body) {
        const result = evalCAD(stmt, loopContext);
        if (result !== undefined) {
          if (!isSDFExpression(result)) {
            throw parseError('Expected SDF expression in for loop body', stmt.location);
          }
          results.push(result);
        }
      }
    }
    return {
      type: 'group',
      expressions: results
    };
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
      
      const children = flattenScope(call.children, context, 'smooth_union', call.location);
      return {
        type: 'sdf',
        expr: children.map(c => c.expr).reduce((acc, curr) => smooth_union(acc, curr, radius))
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
      return {
        type: 'sdf',
        expr: children.map(c => c.expr).reduce((acc, curr) => smooth_intersection(acc, curr, radius))
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
      return {
        type: 'sdf',
        expr: children.map(c => c.expr).reduce((acc, curr) => smooth_difference(acc, curr, radius))
      };
    }
    case 'cube': {
      const size = evalArg(0, 1);
      if (typeof size !== 'number') {
        throw parseError('cube size must be a number', call.location);
      }
      
      if (call.children?.length) {
        throw parseError('cube does not accept children', call.location);
      }
      
      return {
        type: 'sdf',
        expr: `max(max(abs(x) - ${size/2}, abs(y) - ${size/2}), abs(z) - ${size/2})`
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
      
      return {
        type: 'sdf',
        expr: `sqrt(x*x + y*y + z*z) - ${r}`
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
      // Convert degrees to radians
      const [rx, ry, rz] = vec.map(deg => deg * Math.PI / 180);
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
      const children = flattenScope(call.children, context, 'block', call.location);
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

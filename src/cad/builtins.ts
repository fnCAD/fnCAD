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
  NumberLiteral,
  RelativeNumberLiteral,
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
  FunctionCallExpression,
} from './types';
import { parse as parseSDF } from '../sdf_expressions/parser';
import { getKnownSDFNames } from '../sdf_expressions/evaluator';

// Relative value type for percentage and ratio values
export interface RelativeValue {
  type: 'relative';
  value: number;
}

export type EvalResult = number | number[] | RelativeValue;
import { parseError } from './errors';

/**
 * Expands CAD variables in an SDF expression
 */
function expandSDFWithContext(
  expression: string,
  context: Context,
  location: SourceLocation
): string {
  const knownNames = getKnownSDFNames();

  // Replace all identifiers in a single pass
  const expandedExpr = expression.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (_match, identifier) => {
    // If it's a known SDF function/variable, keep it as is
    if (knownNames.has(identifier)) {
      return identifier;
    }

    // Look up if it's a CAD variable
    const value = context.get(identifier);

    // If not a variable, it's an error
    if (value === undefined) {
      throw parseError(`SDF expression references undefined variable: ${identifier}`, location);
    }

    // Only numbers can be expanded
    if (typeof value === 'number') {
      return value.toString();
    }

    throw parseError(
      `Variable ${identifier} is not a number, cannot use in SDF expression`,
      location
    );
  });

  // Validate the expanded expression
  try {
    parseSDF(expandedExpr);
  } catch (e) {
    if (e instanceof Error) {
      throw parseError(`Invalid SDF expression after expansion: ${e.message}`, location);
    }
    throw parseError(`Invalid SDF expression after expansion`, location);
  }

  return expandedExpr;
}

// Parameter definition types
interface ParameterDef {
  name: string;
  type: 'number' | 'vector' | 'boolean' | 'relative';
  required?: boolean; // Default true
  keywordOnly?: boolean; // Parameters that must be specified by name
  defaultValue?: any;
  validator?: (value: any) => boolean | string; // Return false or error message string
  description?: string; // For error messages
}

// For typed parameter access
interface ProcessedArgs {
  [key: string]: number | number[] | RelativeValue | Array<number | number[] | RelativeValue>;
  _positional: Array<number | number[] | RelativeValue>; // For varargs access
}

/**
 * Process and validate function arguments according to parameter definitions
 */
function processArgs(
  defs: ParameterDef[],
  args: Record<string, Expression>,
  context: Context,
  location: SourceLocation
): ProcessedArgs {
  const result: ProcessedArgs = { _positional: [] };
  const usedArgs = new Set<string>();

  // First, handle positional arguments
  let posIdx = 0;
  const positionalParams = defs.filter((p) => !p.keywordOnly);

  while (args[posIdx.toString()]) {
    if (posIdx >= positionalParams.length) {
      throw parseError(`Too many positional arguments`, location);
    }

    const param = positionalParams[posIdx];
    const value = evalExpression(args[posIdx.toString()], context);

    // Auto-convert types if needed (like number to vector)
    let processedValue = value;

    // Number to vector conversion
    if (param.type === 'vector' && typeof value === 'number') {
      processedValue = [value, value, value]; // Convert to 3D vector
    }

    // Validate type and run custom validator
    const validationError = validateArgument(processedValue, param);
    if (validationError) {
      throw parseError(`Invalid value for ${param.name}: ${validationError}`, location);
    }

    result[param.name] = processedValue;
    result._positional.push(processedValue);
    usedArgs.add(posIdx.toString());
    posIdx++;
  }

  // Then, handle keyword arguments
  for (const [key, expr] of Object.entries(args)) {
    if (!isNaN(Number(key))) continue; // Skip positional args

    const param = defs.find((p) => p.name === key);
    if (!param) {
      throw parseError(`Unknown parameter: ${key}`, location);
    }

    if (result[param.name] !== undefined) {
      throw parseError(`Parameter ${key} was already set positionally`, location);
    }

    const value = evalExpression(expr, context);

    // Auto-convert types if needed (like number to vector)
    let processedValue = value;

    // Number to vector conversion
    if (param.type === 'vector' && typeof value === 'number') {
      processedValue = [value, value, value]; // Convert to 3D vector
    }

    // Validate type and run custom validator
    const validationError = validateArgument(processedValue, param);
    if (validationError) {
      throw parseError(`Invalid value for ${param.name}: ${validationError}`, location);
    }

    result[param.name] = processedValue;
    usedArgs.add(key);
  }

  // Check for unknown arguments
  for (const key of Object.keys(args)) {
    if (!usedArgs.has(key) && isNaN(Number(key))) {
      throw parseError(`Unknown parameter: ${key}`, location);
    }
  }

  // Apply defaults for missing arguments
  for (const param of defs) {
    if (result[param.name] === undefined) {
      if (param.required !== false) {
        throw parseError(`Missing required parameter: ${param.name}`, location);
      }
      if (param.defaultValue !== undefined) {
        result[param.name] = param.defaultValue;
      }
    }
  }

  return result;
}

/**
 * Validate an argument against its parameter definition
 */
function validateArgument(value: any, param: ParameterDef): string | false {
  // Auto-convert single numbers to vectors if needed
  if (param.type === 'vector' && typeof value === 'number') {
    // Don't report an error for numbers that can be auto-converted to vectors
    return false;
  }

  // Type checking
  switch (param.type) {
    case 'number':
      if (typeof value !== 'number') {
        return `Expected number, got ${typeof value}`;
      }
      break;
    case 'vector':
      if (!Array.isArray(value) || !value.every((v) => typeof v === 'number')) {
        return `Expected vector of numbers, got ${typeof value}`;
      }
      break;
    case 'boolean':
      if (typeof value !== 'number' || (value !== 0 && value !== 1)) {
        return `Expected boolean (0 or 1), got ${typeof value}`;
      }
      break;
    case 'relative':
      if (
        !(
          typeof value === 'object' &&
          value !== null &&
          'type' in value &&
          value.type === 'relative'
        ) &&
        typeof value !== 'number'
      ) {
        return `Expected number or relative value, got ${typeof value}`;
      }
      break;
  }

  // Custom validator
  if (param.validator) {
    const result = param.validator(value);
    if (result === false) {
      return `Failed validation`;
    } else if (typeof result === 'string') {
      return result;
    }
  }

  return false;
}

// Export evalExpression so it can be used by types.ts
export function evalExpression(expr: Expression, context: Context): EvalResult {
  if (expr instanceof NumberLiteral) {
    return expr.value;
  }
  if (expr instanceof RelativeNumberLiteral) {
    return {
      type: 'relative',
      value: expr.value,
    };
  }
  if (expr instanceof Identifier) {
    const value = context.get(expr.name);
    if (value === undefined) {
      throw parseError(`Undefined variable: ${expr.name}`, expr.location);
    }
    if (
      typeof value !== 'number' &&
      !Array.isArray(value) &&
      !(typeof value === 'object' && value !== null && 'type' in value && value.type === 'relative')
    ) {
      throw parseError(
        `Variable ${expr.name} is not a number, vector, or relative value`,
        expr.location
      );
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

    // Helper function to describe a value's type for error messages
    const describeType = (value: any): string => {
      if (Array.isArray(value)) return `vector[${value.length}]`;
      if (typeof value === 'object' && value !== null && 'type' in value) return value.type;
      return typeof value;
    };

    // Arithmetic operators (+, -, *, /)
    if (['+', '-', '*', '/'].includes(expr.operator)) {
      // Vector arithmetic
      if (Array.isArray(left) && Array.isArray(right)) {
        // Vector + Vector or Vector - Vector
        if (expr.operator === '+' || expr.operator === '-') {
          if (left.length !== right.length) {
            throw parseError(
              `Vector dimensions must match for ${expr.operator === '+' ? 'addition' : 'subtraction'}: ` +
                `${describeType(left)} ${expr.operator} ${describeType(right)}`,
              expr.location
            );
          }

          // Use eval for simplicity since we're in a safe context
          return left.map((val, i) => eval(`(${val} ${expr.operator} ${right[i]})`));
        }
      }

      // Vector * Number or Number * Vector
      if (
        expr.operator === '*' &&
        ((Array.isArray(left) && typeof right === 'number') ||
          (typeof left === 'number' && Array.isArray(right)))
      ) {
        const vector = Array.isArray(left) ? left : (right as number[]);
        const scalar = Array.isArray(left) ? (right as number) : left;
        return vector.map((val) => (val as number) * scalar);
      }

      // Vector / Number
      if (expr.operator === '/' && Array.isArray(left) && typeof right === 'number') {
        if (right === 0) throw parseError('Division by zero', expr.location);
        return left.map((val) => (val as number) / right);
      }

      // Number op Number
      if (typeof left === 'number' && typeof right === 'number') {
        if (expr.operator === '/' && right === 0) {
          throw parseError('Division by zero', expr.location);
        }
        // Use eval for simplicity
        return eval(`${left} ${expr.operator} ${right}`);
      }

      // If we get here, the types are incompatible
      throw parseError(
        `Incompatible types for operator '${expr.operator}': ` +
          `${describeType(left)} and ${describeType(right)}`,
        expr.location
      );
    }

    // Comparison operators
    if (['==', '!=', '<', '<=', '>', '>='].includes(expr.operator)) {
      if (typeof left !== 'number' || typeof right !== 'number') {
        throw parseError(
          `Comparison operation '${expr.operator}' requires number operands, got: ` +
            `${describeType(left)} and ${describeType(right)}`,
          expr.location
        );
      }

      // Use eval for simplicity
      return Number(eval(`${left} ${expr.operator} ${right}`));
    }

    // Logical operators
    if (['&&', '||'].includes(expr.operator)) {
      if (typeof left !== 'number' || typeof right !== 'number') {
        throw parseError(
          `Logical operation '${expr.operator}' requires number operands, got: ` +
            `${describeType(left)} and ${describeType(right)}`,
          expr.location
        );
      }

      return expr.operator === '&&'
        ? left !== 0 && right !== 0
          ? 1
          : 0
        : left !== 0 || right !== 0
          ? 1
          : 0;
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
  if (expr instanceof FunctionCallExpression) {
    // Evaluate the arguments first
    const evaluatedArgs: Record<string, Value> = {};
    for (const [key, argExpr] of Object.entries(expr.args)) {
      evaluatedArgs[key] = evalExpression(argExpr, context);
    }

    // Use the logic from the math functions in evalModuleCall
    switch (expr.name) {
      case 'sin':
        // Convert degrees to radians (OpenSCAD compatibility)
        return Math.sin(((evaluatedArgs['0'] as number) * Math.PI) / 180);
      case 'cos':
        return Math.cos(((evaluatedArgs['0'] as number) * Math.PI) / 180);
      case 'tan':
        return Math.tan(((evaluatedArgs['0'] as number) * Math.PI) / 180);
      case 'asin':
        // Convert radians to degrees
        return (Math.asin(evaluatedArgs['0'] as number) * 180) / Math.PI;
      case 'acos':
        return (Math.acos(evaluatedArgs['0'] as number) * 180) / Math.PI;
      case 'atan':
        return (Math.atan(evaluatedArgs['0'] as number) * 180) / Math.PI;
      case 'atan2': {
        const y = evaluatedArgs['0'] as number;
        const x = evaluatedArgs['1'] as number;
        return (Math.atan2(y, x) * 180) / Math.PI;
      }
      case 'abs':
        return Math.abs(evaluatedArgs['0'] as number);
      case 'floor':
        return Math.floor(evaluatedArgs['0'] as number);
      case 'ceil':
        return Math.ceil(evaluatedArgs['0'] as number);
      case 'round':
        return Math.round(evaluatedArgs['0'] as number);
      case 'sqrt':
        return Math.sqrt(evaluatedArgs['0'] as number);
      case 'mod': {
        const x = evaluatedArgs['0'] as number;
        const y = evaluatedArgs['1'] as number;
        return ((x % y) + y) % y; // Handle negative numbers correctly
      }
      case 'pow': {
        const base = evaluatedArgs['base'] || (evaluatedArgs['0'] as number);
        const exponent = evaluatedArgs['exponent'] || (evaluatedArgs['1'] as number);
        return Math.pow(base as number, exponent as number);
      }
      case 'log':
        return Math.log(evaluatedArgs['0'] as number);
      case 'exp':
        return Math.exp(evaluatedArgs['0'] as number);
      case 'min': {
        // Get all positional arguments
        const values = Object.keys(evaluatedArgs)
          .filter((key) => !isNaN(Number(key)))
          .map((key) => evaluatedArgs[key] as number);
        return Math.min(...values);
      }
      case 'max': {
        // Get all positional arguments
        const values = Object.keys(evaluatedArgs)
          .filter((key) => !isNaN(Number(key)))
          .map((key) => evaluatedArgs[key] as number);
        return Math.max(...values);
      }
      default:
        throw parseError(`Unknown function: ${expr.name}`, expr.location);
    }
  }
  throw new Error(`Unsupported expression type: ${expr.constructor.name}`);
}

// Evaluate OpenSCAD-style AST to produce values (numbers or SDF expressions)
// Returns undefined for statements that don't produce values (like module declarations)

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
    const expandedExpr = expandSDFWithContext(node.expression, context, node.location);

    return {
      type: 'sdf',
      expr: expandedExpr,
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
  switch (call.name) {
    case 'smooth_union': {
      const params: ParameterDef[] = [
        {
          name: 'radius',
          type: 'number',
          required: false,
          defaultValue: 0.5,
          description: 'Blend radius',
        },
        {
          name: 'detail',
          type: 'relative',
          required: false,
          keywordOnly: true,
          defaultValue: { type: 'relative', value: 2 },
          description: 'Detail level in the blend region',
        },
      ];

      const args = processArgs(params, call.args, context, call.location);

      if (!call.children?.length) {
        throw parseError('smooth_union requires at least one child node', call.location);
      }

      const radius = args.radius as number;
      const detail = args.detail;

      // Handle the detail parameter with proper typing
      let detailValue: string = '200%';
      if (detail !== undefined) {
        if (typeof detail === 'object' && 'type' in detail) {
          detailValue = `${detail.value * 100}%`;
        } else if (typeof detail === 'number') {
          detailValue = detail.toString();
        }
      }

      const children = flattenScope(call.children, context, 'smooth_union', call.location);

      return {
        type: 'sdf',
        expr: smooth_union(
          radius,
          children.map((c) => c.expr),
          detailValue
        ),
        bounds: growAABB(combineAABBs(children), radius),
      };
    }

    case 'smooth_intersection': {
      const params: ParameterDef[] = [
        {
          name: 'radius',
          type: 'number',
          required: false,
          defaultValue: 0.5,
          description: 'Blend radius',
        },
        {
          name: 'detail',
          type: 'relative',
          required: false,
          keywordOnly: true,
          defaultValue: { type: 'relative', value: 2 },
          description: 'Detail level in the blend region',
        },
      ];

      const args = processArgs(params, call.args, context, call.location);

      if (!call.children?.length) {
        throw parseError('smooth_intersection requires at least one child node', call.location);
      }

      const radius = args.radius as number;
      const detail = args.detail;

      // Handle the detail parameter with proper typing
      let detailValue: string = '200%';
      if (detail !== undefined) {
        if (typeof detail === 'object' && 'type' in detail) {
          detailValue = `${detail.value * 100}%`;
        } else if (typeof detail === 'number') {
          detailValue = detail.toString();
        }
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
          radius,
          detailValue
        ),
        bounds,
      };
    }

    case 'smooth_difference': {
      const params: ParameterDef[] = [
        {
          name: 'radius',
          type: 'number',
          required: false,
          defaultValue: 0.5,
          description: 'Blend radius',
        },
        {
          name: 'detail',
          type: 'relative',
          required: false,
          keywordOnly: true,
          defaultValue: { type: 'relative', value: 2 },
          description: 'Detail level in the blend region',
        },
      ];

      const args = processArgs(params, call.args, context, call.location);

      if (!call.children?.length) {
        throw parseError('smooth_difference requires at least one child node', call.location);
      }

      const radius = args.radius as number;
      const detail = args.detail;

      // Handle the detail parameter with proper typing
      let detailValue: string = '200%';
      if (detail !== undefined) {
        if (typeof detail === 'object' && 'type' in detail) {
          detailValue = `${detail.value * 100}%`;
        } else if (typeof detail === 'number') {
          detailValue = detail.toString();
        }
      }

      const children = flattenScope(call.children, context, 'smooth_difference', call.location);

      // For smooth difference, we need to grow the first shape's bounds by the blend radius
      const bounds = growAABB(children[0].bounds, radius);

      return {
        type: 'sdf',
        expr: smooth_difference(
          children.map((c) => c.expr),
          radius,
          detailValue
        ),
        bounds,
      };
    }
    case 'cube': {
      const params: ParameterDef[] = [
        {
          name: 'size',
          type: 'vector',
          required: true,
          description: 'Size of the cube (single number or [x,y,z] vector)',
          validator: (value) => {
            if (Array.isArray(value) && value.length === 3) return true;
            return 'Must be a [x,y,z] vector';
          },
        },
      ];

      const args = processArgs(params, call.args, context, call.location);

      if (call.children?.length) {
        throw parseError('cube does not accept children', call.location);
      }

      // After our auto-conversion, size will always be an array
      const sizes = args.size as number[];

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

    case 'smooth_cube': {
      const params: ParameterDef[] = [
        {
          name: 'size',
          type: 'vector',
          required: true,
          description: 'Size of the cube (single number or [x,y,z] vector)',
          validator: (value) => {
            if (Array.isArray(value) && value.length === 3) return true;
            return 'Must be a [x,y,z] vector';
          },
        },
        {
          name: 'radius',
          type: 'number',
          required: false,
          defaultValue: 0.1,
          description: 'Radius of rounded edges',
        },
      ];

      const args = processArgs(params, call.args, context, call.location);

      if (call.children?.length) {
        throw parseError('smooth_cube does not accept children', call.location);
      }

      // After our auto-conversion, size will always be an array
      const sizes = args.size as number[];
      const radius = args.radius as number;

      const halfSizes = sizes.map((s) => s / 2);
      // For flat surfaces, use 1/4 of the smallest dimension as minSize
      const minSize = Math.min(...sizes) * 0.25;

      // For a smooth cube, we use smooth_intersection of 6 half-spaces
      // Each half-space is defined by a plane at distance halfSize from the origin
      // The SDF for a half-space is simply the distance to the plane
      return {
        type: 'sdf',
        expr: smooth_intersection(
          [
            `face(abs(x) - ${halfSizes[0]}, ${minSize})`,
            `face(abs(y) - ${halfSizes[1]}, ${minSize})`,
            `face(abs(z) - ${halfSizes[2]}, ${minSize})`,
          ],
          radius,
          '200%'
        ),
        bounds: {
          min: [-halfSizes[0], -halfSizes[1], -halfSizes[2]],
          max: [halfSizes[0], halfSizes[1], halfSizes[2]],
        },
      };
    }

    case 'sphere': {
      const params: ParameterDef[] = [
        { name: 'radius', type: 'number', required: true, description: 'Radius of the sphere' },
      ];

      const args = processArgs(params, call.args, context, call.location);

      if (call.children?.length) {
        throw parseError('sphere does not accept children', call.location);
      }

      const radius = args.radius as number;
      const minSize = radius * 0.25;

      return {
        type: 'sdf',
        expr: `face(sqrt(x*x + y*y + z*z) - ${radius}, ${minSize})`,
        bounds: {
          min: [-radius, -radius, -radius],
          max: [radius, radius, radius],
        },
      };
    }

    case 'cylinder': {
      const params: ParameterDef[] = [
        { name: 'radius', type: 'number', required: true, description: 'Radius of the cylinder' },
        { name: 'height', type: 'number', required: true, description: 'Height of the cylinder' },
      ];

      const args = processArgs(params, call.args, context, call.location);

      if (call.children?.length) {
        throw parseError('cylinder does not accept children', call.location);
      }

      const radius = args.radius as number;
      const height = args.height as number;
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
      const params: ParameterDef[] = [
        { name: 'radius', type: 'number', required: true, description: 'Base radius of the cone' },
        { name: 'height', type: 'number', required: true, description: 'Height of the cone' },
      ];

      const args = processArgs(params, call.args, context, call.location);

      if (call.children?.length) {
        throw parseError('cone does not accept children', call.location);
      }

      const radius = args.radius as number;
      const height = args.height as number;
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
      const params: ParameterDef[] = [
        {
          name: 'vec',
          type: 'vector',
          required: true,
          description: 'Translation vector [x,y,z]',
          validator: (vec) =>
            Array.isArray(vec) && vec.length === 3 ? true : 'Must be a 3D vector [x,y,z]',
        },
      ];

      const args = processArgs(params, call.args, context, call.location);
      const vec = args.vec as number[];
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
      const params: ParameterDef[] = [
        {
          name: 'angles',
          type: 'vector',
          required: true,
          description: 'Rotation angles in degrees [x,y,z]',
          validator: (vec) =>
            Array.isArray(vec) && vec.length === 3
              ? true
              : 'Must be a 3D vector [x,y,z] of rotation angles in degrees',
        },
      ];

      const args = processArgs(params, call.args, context, call.location);
      const vec = args.angles as number[];

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
      const params: ParameterDef[] = [
        {
          name: 'factors',
          type: 'vector',
          required: true,
          description: 'Scale factors [x,y,z] or single uniform scale',
          validator: (value) => {
            if (typeof value === 'number') return true;
            if (Array.isArray(value) && value.length === 3) return true;
            return 'Must be a number or [x,y,z] vector';
          },
        },
      ];

      const args = processArgs(params, call.args, context, call.location);

      let vec: number[];
      const factorsArg = args.factors;

      if (typeof factorsArg === 'number') {
        vec = [factorsArg, factorsArg, factorsArg];
      } else {
        vec = factorsArg as number[];
      }

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
        expr: `scale(${sx}, ${sy}, ${sz}, ${childExpr.expr})`,
        bounds,
      };
    }

    case 'union': {
      const params: ParameterDef[] = [];

      processArgs(params, call.args, context, call.location);

      if (!call.children?.length) {
        return { type: 'sdf', expr: '0' };
      }
      const children = flattenScope(call.children, context, 'union', call.location);
      return wrapUnion(children);
    }

    case 'detail': {
      const params: ParameterDef[] = [
        {
          name: 'size',
          type: 'number',
          required: false,
          defaultValue: 0.1,
          description: 'Minimum feature size',
        },
      ];

      const args = processArgs(params, call.args, context, call.location);

      if (!call.children?.length) {
        throw parseError('detail requires at least one child', call.location);
      }

      const size = args.size as number;

      const children = flattenScope(call.children, context, 'detail', call.location);
      const childExpr = wrapUnion(children);
      return {
        type: 'sdf',
        expr: `detail(${size}, ${childExpr.expr})`,
        bounds: childExpr.bounds,
      };
    }

    case 'difference': {
      const params: ParameterDef[] = [];

      processArgs(params, call.args, context, call.location);

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

      const expr =
        negatedChildren.length === 0
          ? base.expr
          : `max(${base.expr}, ${negatedChildren.join(', ')})`;

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
      const params: ParameterDef[] = [];

      processArgs(params, call.args, context, call.location);

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

    case 'shell': {
      const params: ParameterDef[] = [
        {
          name: 'thickness',
          type: 'number',
          required: true,
          description: 'Shell thickness',
        },
      ];
      const args = processArgs(params, call.args, context, call.location);
      const children = flattenScope(call.children, context, 'shell', call.location);
      if (children.length === 0) {
        throw parseError('shell requires at least one child', call.location);
      }
      const childExpr = wrapUnion(children);
      const thickness = args.thickness as number;
      const minSize = thickness;
      // SDF shell: abs(child) - thickness/2
      return {
        type: 'sdf',
        expr: `face(abs(${childExpr.expr}) - ${thickness / 2}, ${minSize})`,
        bounds: growAABB(childExpr.bounds, thickness / 2),
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
export function smooth_union(radius: number, expressions: string[], detailScale: string): string {
  if (expressions.length === 0) return '0';
  if (expressions.length === 1) return expressions[0];
  return `smooth_union(${radius}, ${detailScale}, ${expressions.join(', ')})`;
}

export function smooth_intersection(
  expressions: string[],
  radius: number,
  detailScale: string
): string {
  if (expressions.length === 0) return '0';
  if (expressions.length === 1) return expressions[0];
  // Negate all expressions, apply smooth_union, then negate the result
  return `-${smooth_union(
    radius,
    expressions.map((expr) => `-(${expr})`),
    detailScale
  )}`;
}

export function smooth_difference(
  expressions: string[],
  radius: number,
  detailScale: string
): string {
  if (expressions.length === 0) return '0';
  if (expressions.length === 1) return expressions[0];

  // The first shape is the base to subtract from
  const baseExpr = expressions[0];
  // All other shapes are being subtracted
  const subtractExprs = expressions.slice(1);

  // For smooth difference, negate the base, leave the rest, apply smooth_union, negate result
  return `-${smooth_union(radius, [`-(${baseExpr})`, ...subtractExprs], detailScale)}`;
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

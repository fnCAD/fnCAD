import { Node, NumberNode, VariableNode, BinaryOpNode, UnaryOpNode, FunctionCallNode } from './ast';
import { Interval } from './interval';

export function createNumberNode(value: number): NumberNode {
  return {
    type: 'Number',
    value,
    evaluate: () => value,
    toGLSL: () => `${value.toFixed(1)}`,
    evaluateInterval: () => Interval.from(value)
  };
}

export function createVariableNode(name: string): VariableNode {
  return {
    type: 'Variable',
    name,
    evaluate: (context) => {
      if (!(name in context)) {
        throw new Error(`Undefined variable: ${name}`);
      }
      return context[name];
    },
    evaluateInterval: (context: Record<string, Interval>) => {
      if (!(name in context)) {
        throw new Error(`Undefined variable: ${name}`);
      }
      return context[name];
    },
    toGLSL: () => {
      // Map x,y,z to pos.x, pos.y, pos.z for vector components
      if (name === 'x') return 'pos.x';
      if (name === 'y') return 'pos.y';
      if (name === 'z') return 'pos.z';
      return name;
    }
  };
}

export function createBinaryOpNode(operator: '+' | '-' | '*' | '/', left: Node, right: Node): BinaryOpNode {
  return {
    type: 'BinaryOp',
    operator,
    left,
    right,
    evaluate: (context) => {
      const lval = left.evaluate(context);
      const rval = right.evaluate(context);
      switch (operator) {
        case '+': return lval + rval;
        case '-': return lval - rval;
        case '*': return lval * rval;
        case '/': 
          if (rval === 0) throw new Error('Division by zero');
          return lval / rval;
      }
    },
    toGLSL: () => `(${left.toGLSL()} ${operator} ${right.toGLSL()})`,
    evaluateInterval: (context) => {
      const lval = left.evaluateInterval(context);
      const rval = right.evaluateInterval(context);
      switch (operator) {
        case '+': return lval.add(rval);
        case '-': return lval.subtract(rval);
        case '*': return lval.multiply(rval);
        case '/': return lval.divide(rval);
      }
    }
  };
}

export function createUnaryOpNode(operator: '-', operand: Node): UnaryOpNode {
  return {
    type: 'UnaryOp',
    operator,
    operand,
    evaluate: (context) => {
      const val = operand.evaluate(context);
      return -val;
    },
    toGLSL: () => `(-${operand.toGLSL()})`,
    evaluateInterval: (context) => {
      const val = operand.evaluateInterval(context);
      return val.negate();
    }
  };
}

export function createFunctionCallNode(name: string, args: Node[]): FunctionCallNode {
  return {
    type: 'FunctionCall' as const,
    name,
    args,
    evaluateInterval: (context: Record<string, Interval>) => {
      const evaluatedArgs = args.map(arg => arg.evaluateInterval(context));
      
      // Handle built-in math functions
      switch (name) {
        case 'sqrt':
          return evaluatedArgs[0].sqrt();
        case 'sqr':
          return evaluatedArgs[0].multiply(evaluatedArgs[0]);
        case 'sin':
          return evaluatedArgs[0].sin();
        case 'cos':
          return evaluatedArgs[0].cos();
      }

      // Handle min/max with any number of arguments
      if (name === 'min') {
        if (evaluatedArgs.length === 1) return evaluatedArgs[0];
        return evaluatedArgs.reduce((acc: Interval, interval: Interval) => {
          return new Interval(
            Math.min(acc.min, interval.min),
            Math.min(acc.max, interval.max)
          );
        });
      }
      if (name === 'max') {
        if (evaluatedArgs.length === 1) return evaluatedArgs[0];
        return evaluatedArgs.reduce((acc: Interval, interval: Interval) => {
          return new Interval(
            Math.max(acc.min, interval.min),
            Math.max(acc.max, interval.max)
          );
        });
      }

      throw new Error(`Unknown function: ${name}`);
    },
    evaluate: (context: Record<string, number>) => {
      const evaluatedArgs = args.map(arg => arg.evaluate(context));
      
      // Handle built-in math functions
      if (name === 'sqr') {
        return evaluatedArgs[0] * evaluatedArgs[0];
      }
      if (name in Math) {
        const fn = Math[name as keyof typeof Math];
        if (typeof fn === 'function') {
          return fn.apply(Math, evaluatedArgs);
        }
      }

      // Handle min/max with any number of arguments
      if (name === 'min') {
        if (evaluatedArgs.length === 1) return evaluatedArgs[0];
        return Math.min(...evaluatedArgs);
      }
      if (name === 'max') {
        if (evaluatedArgs.length === 1) return evaluatedArgs[0];
        return Math.max(...evaluatedArgs);
      }

      throw new Error(`Unknown function: ${name}`);
    },
    toGLSL: () => {
      // Handle min/max with any number of arguments
      if (name === 'min' || name === 'max') {
        if (args.length === 1) return args[0].toGLSL();
        if (args.length > 2) {
          // Fold multiple arguments into nested min/max calls
          return args.reduce((acc, arg, i) => {
            if (i === 0) return arg.toGLSL();
            return `${name}(${acc}, ${arg.toGLSL()})`;
          }, '');
        }
      }
      // Default case for other functions or min/max with 2 args
      return `${name}(${args.map(arg => arg.toGLSL()).join(', ')})`;
    }
  };
}

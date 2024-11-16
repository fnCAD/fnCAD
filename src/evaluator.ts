import { Node, NumberNode, VariableNode, BinaryOpNode, UnaryOpNode, FunctionCallNode } from './ast';

export function createNumberNode(value: number): NumberNode {
  return {
    type: 'Number',
    value,
    evaluate: () => value,
    toGLSL: () => `${value.toFixed(1)}`
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
    toGLSL: () => {
      // Map x,y,z to p.x, p.y, p.z for vector components
      if (name === 'x') return 'p.x';
      if (name === 'y') return 'p.y';
      if (name === 'z') return 'p.z';
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
    toGLSL: () => `(${left.toGLSL()} ${operator} ${right.toGLSL()})`
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
    toGLSL: () => `(-${operand.toGLSL()})`
  };
}

export function createFunctionCallNode(name: string, args: Node[]): FunctionCallNode {
  return {
    type: 'FunctionCall',
    name,
    args,
    evaluate: (context) => {
      const evaluatedArgs = args.map(arg => arg.evaluate(context));
      
      // Handle built-in math functions
      if (name in Math) {
        const fn = Math[name as keyof typeof Math];
        if (typeof fn === 'function') {
          return fn.apply(Math, evaluatedArgs);
        }
      }

      // Handle min/max with any number of arguments
      if (name === 'min' && evaluatedArgs.length >= 2) {
        return Math.min(...evaluatedArgs);
      }
      if (name === 'max' && evaluatedArgs.length >= 2) {
        return Math.max(...evaluatedArgs);
      }

      throw new Error(`Unknown function: ${name}`);
    },
    toGLSL: () => {
      // Handle min/max with more than 2 arguments by nesting calls
      if ((name === 'min' || name === 'max') && args.length > 2) {
        // Fold multiple arguments into nested min/max calls
        return args.reduce((acc, arg, i) => {
          if (i === 0) return arg.toGLSL();
          return `${name}(${acc}, ${arg.toGLSL()})`;
        }, '');
      }
      // Default case for other functions or min/max with 2 args
      return `${name}(${args.map(arg => arg.toGLSL()).join(', ')})`;
    }
  };
}

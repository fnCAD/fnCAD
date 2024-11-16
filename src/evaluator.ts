import { Node, NumberNode, VariableNode, BinaryOpNode, UnaryOpNode, FunctionCallNode } from './ast';

export function createNumberNode(value: number): NumberNode {
  return {
    type: 'Number',
    value,
    evaluate: () => value
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
    }
  };
}

export function createFunctionCallNode(name: string, args: Node[]): FunctionCallNode {
  return {
    type: 'FunctionCall',
    name,
    args,
    evaluate: (context) => {
      const fn = Math[name as keyof typeof Math];
      if (typeof fn !== 'function') {
        throw new Error(`Unknown function: ${name}`);
      }
      const evaluatedArgs = args.map(arg => arg.evaluate(context));
      return fn(...evaluatedArgs);
    }
  };
}

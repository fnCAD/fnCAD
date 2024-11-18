import { Node, NumberNode, VariableNode, BinaryOpNode, UnaryOpNode, FunctionCallNode } from './ast';
import { Interval } from './interval';
import { GLSLContext } from './glslgen';

export function createNumberNode(value: number): NumberNode {
  return {
    type: 'Number',
    value,
    evaluate: () => value,
    toGLSL: (context: GLSLContext) => {
      return context.generator.save(value.toFixed(1), 'float');
    },
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
    toGLSL: (context: GLSLContext) => {
      // Map x,y,z to components of the current point
      if (name === 'x') return context.generator.save(`${context.getPoint()}.x`, 'float');
      if (name === 'y') return context.generator.save(`${context.getPoint()}.y`, 'float');
      if (name === 'z') return context.generator.save(`${context.getPoint()}.z`, 'float');
      return context.generator.save(name, 'float');
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
    toGLSL: (context: GLSLContext) => {
      const lval = left.toGLSL(context);
      const rval = right.toGLSL(context);
      return context.generator.save(`${lval} ${operator} ${rval}`);
    },
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
    toGLSL: (context: GLSLContext) => {
      const val = operand.toGLSL(context);
      return context.generator.save(`-${val}`);
    },
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
        case 'abs':
          if (evaluatedArgs[0].max < 0) {
            // Entirely negative interval
            return new Interval(-evaluatedArgs[0].max, -evaluatedArgs[0].min);
          } else if (evaluatedArgs[0].min > 0) {
            // Entirely positive interval
            return evaluatedArgs[0];
          } else {
            // Interval contains zero
            return new Interval(
              0,
              Math.max(-evaluatedArgs[0].min, evaluatedArgs[0].max)
            );
          }
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
      if (name === 'abs') {
        return Math.abs(evaluatedArgs[0]);
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
    toGLSL: (context: GLSLContext) => {
      // Evaluate all arguments first
      const evalArgs = args.map(arg => arg.toGLSL(context));
      
      // Handle min/max with any number of arguments
      if (name === 'min' || name === 'max') {
        if (args.length === 1) return evalArgs[0];
        // Fold multiple arguments into nested min/max calls
        return evalArgs.reduce((acc, arg, i) => {
          if (i === 0) return arg;
          return context.generator.save(`${name}(${acc}, ${arg})`, 'float');
        });
      }
      
      // Default case for other functions
      return context.generator.save(`${name}(${evalArgs.join(', ')})`, 'float');
    }
  };
}

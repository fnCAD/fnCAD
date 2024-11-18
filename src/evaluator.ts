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
      return context.generator.save(`${lval} ${operator} ${rval}`, 'float');
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
      return context.generator.save(`-${val}`, 'float');
    },
    evaluateInterval: (context) => {
      const val = operand.evaluateInterval(context);
      return val.negate();
    }
  };
}


export function createFunctionCallNode(name: string, args: Node[]): FunctionCallNode | TransformNode {
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

      // Handle transformations
      if (name === 'translate' && args.length === 4) {
        const [dx, dy, dz, body] = args;
        // Evaluate translation amounts
        const tx = dx.evaluateInterval(context);
        const ty = dy.evaluateInterval(context);
        const tz = dz.evaluateInterval(context);
        // Translate the intervals
        const newContext = {...context};
        newContext['x'] = new Interval(
          context['x'].min - tx.max,
          context['x'].max - tx.min
        );
        newContext['y'] = new Interval(
          context['y'].min - ty.max,
          context['y'].max - ty.min
        );
        newContext['z'] = new Interval(
          context['z'].min - tz.max,
          context['z'].max - tz.min
        );
        return body.evaluateInterval(newContext);
      }

      if (name === 'rotate' && args.length === 4) {
        const [rx, ry, rz, body] = args;
        // Get rotation angles
        const ax = rx.evaluate({});
        const ay = ry.evaluate({});
        const az = rz.evaluate({});
        
        // Get corners of the interval box
        const x = context['x'];
        const y = context['y'];
        const z = context['z'];
        const corners = [
          [x.min, y.min, z.min], [x.max, y.min, z.min],
          [x.min, y.max, z.min], [x.max, y.max, z.min],
          [x.min, y.min, z.max], [x.max, y.min, z.max],
          [x.min, y.max, z.max], [x.max, y.max, z.max]
        ];
        
        // Transform each corner
        const transformedX: number[] = [];
        const transformedY: number[] = [];
        const transformedZ: number[] = [];
        
        const cx = Math.cos(ax), sx = Math.sin(ax);
        const cy = Math.cos(ay), sy = Math.sin(ay);
        const cz = Math.cos(az), sz = Math.sin(az);
        
        for (const [px, py, pz] of corners) {
          // Apply rotation matrix
          const nx = cy*cz*px + (-cy*sz)*py + sy*pz;
          const ny = (cx*sz + sx*sy*cz)*px + (cx*cz - sx*sy*sz)*py + (-sx*cy)*pz;
          const nz = (sx*sz - cx*sy*cz)*px + (sx*cz + cx*sy*sz)*py + (cx*cy)*pz;
          
          transformedX.push(nx);
          transformedY.push(ny);
          transformedZ.push(nz);
        }
        
        // Compute bounding box of transformed points
        const newContext = {...context};
        newContext['x'] = Interval.boundingBox(transformedX);
        newContext['y'] = Interval.boundingBox(transformedY);
        newContext['z'] = Interval.boundingBox(transformedZ);
        
        return body.evaluateInterval(newContext);
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

      // Handle transforms
      if (name === 'translate' && args.length === 4) {
        const [dx, dy, dz, body] = args;
        const newX = context['x'] - dx.evaluate(context);
        const newY = context['y'] - dy.evaluate(context);
        const newZ = context['z'] - dz.evaluate(context);
        return body.evaluate({...context, 'x': newX, 'y': newY, 'z': newZ});
      }
      if (name === 'rotate' && args.length === 4) {
        const [rx, ry, rz, body] = args;
        const cx = Math.cos(rx.evaluate(context));
        const sx = Math.sin(rx.evaluate(context));
        const cy = Math.cos(ry.evaluate(context));
        const sy = Math.sin(ry.evaluate(context));
        const cz = Math.cos(rz.evaluate(context));
        const sz = Math.sin(rz.evaluate(context));
        
        // Apply rotation matrix
        const x = context.x;
        const y = context.y;
        const z = context.z;
        
        // Rotation matrix multiplication
        const nx = cy*cz*x + (-cy*sz)*y + sy*z;
        const ny = (cx*sz + sx*sy*cz)*x + (cx*cz - sx*sy*sz)*y + (-sx*cy)*z;
        const nz = (sx*sz - cx*sy*cz)*x + (sx*cz + cx*sy*sz)*y + (cx*cy)*z;
        
        return body.evaluate({...context, x: nx, y: ny, z: nz});
      }

      throw new Error(`Unknown function: ${name}`);
    },
    toGLSL: (context: GLSLContext) => {
      // Handle transforms first
      if (name === 'translate' && args.length === 4) {
        const [dx, dy, dz, body] = args;
        const evalDx = dx.evaluate({});
        const evalDy = dy.evaluate({});
        const evalDz = dz.evaluate({});
        const newContext = context.translate(evalDx, evalDy, evalDz);
        return body.toGLSL(newContext);
      }
      if (name === 'rotate' && args.length === 4) {
        const [rx, ry, rz, body] = args;
        const evalRx = rx.evaluate({});
        const evalRy = ry.evaluate({});
        const evalRz = rz.evaluate({});
        const newContext = context.rotate(evalRx, evalRy, evalRz);
        return body.toGLSL(newContext);
      }

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

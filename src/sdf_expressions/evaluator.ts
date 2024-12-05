import { Node, NumberNode, VariableNode, BinaryOpNode, UnaryOpNode, FunctionCallNode } from './ast';
import { Interval } from '../interval';
import { GLSLContext } from './glslgen';

export function createNumberNode(value: number): NumberNode {
  return {
    type: 'Number',
    value,
    evaluate: () => value,
    toGLSL: (context: GLSLContext) => {
      // Format number with at least one decimal place
      const glslNumber = Number.isInteger(value) ? `${value}.0` : value.toString();
      return context.generator.save(glslNumber, 'float');
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


function enforceArgumentLength(name: string, args: Node[], expected: number) {
  if (args.length !== expected) {
    throw new Error(`${name} requires exactly ${expected} argument(s), got ${args.length}`);
  }
}

export function createFunctionCallNode(name: string, args: Node[]): FunctionCallNode {
  if (name === 'sin') {
    enforceArgumentLength(name, args, 1);
    return {
      type: 'FunctionCall' as const,
      name,
      args,
      evaluateInterval: (context: Record<string, Interval>) => {
        return args[0].evaluateInterval(context).sin();
      },
      evaluate: (context: Record<string, number>) => {
        return Math.sin(args[0].evaluate(context));
      },
      toGLSL: (context: GLSLContext) => {
        return context.generator.save(`sin(${args[0].toGLSL(context)})`, 'float');
      }
    };
  }

  if (name === 'cos') {
    enforceArgumentLength(name, args, 1);
    return {
      type: 'FunctionCall' as const,
      name,
      args,
      evaluateInterval: (context: Record<string, Interval>) => {
        return args[0].evaluateInterval(context).cos();
      },
      evaluate: (context: Record<string, number>) => {
        return Math.cos(args[0].evaluate(context));
      },
      toGLSL: (context: GLSLContext) => {
        return context.generator.save(`cos(${args[0].toGLSL(context)})`, 'float');
      }
    };
  }

  if (name === 'sqrt') {
    enforceArgumentLength(name, args, 1);
    return {
      type: 'FunctionCall' as const,
      name,
      args,
      evaluateInterval: (context: Record<string, Interval>) => {
        return args[0].evaluateInterval(context).sqrt();
      },
      evaluate: (context: Record<string, number>) => {
        return Math.sqrt(args[0].evaluate(context));
      },
      toGLSL: (context: GLSLContext) => {
        return context.generator.save(`sqrt(${args[0].toGLSL(context)})`, 'float');
      }
    };
  }

  if (name === 'sqr') {
    enforceArgumentLength(name, args, 1);
    return {
      type: 'FunctionCall' as const,
      name,
      args,
      evaluateInterval: (context: Record<string, Interval>) => {
        const x = args[0].evaluateInterval(context);
        return x.multiply(x);
      },
      evaluate: (context: Record<string, number>) => {
        const x = args[0].evaluate(context);
        return x * x;
      },
      toGLSL: (context: GLSLContext) => {
        const x = args[0].toGLSL(context);
        return context.generator.save(`(${x} * ${x})`, 'float');
      }
    };
  }

  if (name === 'log') {
    enforceArgumentLength(name, args, 1);
    return {
      type: 'FunctionCall' as const,
      name,
      args,
      evaluateInterval: (context: Record<string, Interval>) => {
        return args[0].evaluateInterval(context).log();
      },
      evaluate: (context: Record<string, number>) => {
        return Math.log(args[0].evaluate(context));
      },
      toGLSL: (context: GLSLContext) => {
        return context.generator.save(`log(${args[0].toGLSL(context)})`, 'float');
      }
    };
  }

  if (name === 'min') {
    if (args.length < 1) throw new Error('min requires at least 1 argument');
    return {
      type: 'FunctionCall' as const,
      name,
      args,
      evaluateInterval: (context: Record<string, Interval>) => {
        const intervals = args.map(arg => arg.evaluateInterval(context));
        if (intervals.length === 1) return intervals[0];
        return intervals.reduce((acc, interval) => new Interval(
          Math.min(acc.min, interval.min),
          Math.min(acc.max, interval.max)
        ));
      },
      evaluate: (context: Record<string, number>) => {
        const values = args.map(arg => arg.evaluate(context));
        if (values.length === 1) return values[0];
        return Math.min(...values);
      },
      toGLSL: (context: GLSLContext) => {
        const evalArgs = args.map(arg => arg.toGLSL(context));
        if (evalArgs.length === 1) return evalArgs[0];
        return evalArgs.reduce((acc, arg, i) => {
          if (i === 0) return arg;
          return context.generator.save(`min(${acc}, ${arg})`, 'float');
        });
      }
    };
  }

  if (name === 'rotate') {
    enforceArgumentLength(name, args, 4);
    const [rx, ry, rz, body] = args;
    return {
      type: 'FunctionCall' as const,
      name,
      args,
      evaluateInterval: (context: Record<string, Interval>) => {
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
        
        // Compute trig values
        const cx = Math.cos(ax), sx = Math.sin(ax);
        const cy = Math.cos(ay), sy = Math.sin(ay);
        const cz = Math.cos(az), sz = Math.sin(az);
        
        // Transform each corner
        const transformedX: number[] = [];
        const transformedY: number[] = [];
        const transformedZ: number[] = [];
        
        // It says this is XYZ order but in GLSL it has to be ZYX order to match. Why?
        for (const [px, py, pz] of corners) {
          // First rotate around X
          const x1 = px;
          const y1 = py * cx - pz * sx;
          const z1 = py * sx + pz * cx;
          
          // Then around Y
          const x2 = x1 * cy + z1 * sy;
          const y2 = y1;
          const z2 = -x1 * sy + z1 * cy;
          
          // Finally around Z
          const nx = x2 * cz - y2 * sz;
          const ny = x2 * sz + y2 * cz;
          const nz = z2;
          
          transformedX.push(nx);
          transformedY.push(ny);
          transformedZ.push(nz);
        }
        
        // Compute bounds for each axis
        const newContext = {...context};
        newContext['x'] = Interval.bound(transformedX);
        newContext['y'] = Interval.bound(transformedY);
        newContext['z'] = Interval.bound(transformedZ);
        
        return body.evaluateInterval(newContext);
      },
      evaluate: (context: Record<string, number>) => {
        const ax = rx.evaluate(context);
        const ay = ry.evaluate(context);
        const az = rz.evaluate(context);
        
        // Compute trig values
        const cx = Math.cos(ax), sx = Math.sin(ax);
        const cy = Math.cos(ay), sy = Math.sin(ay);
        const cz = Math.cos(az), sz = Math.sin(az);
        
        const x = context.x;
        const y = context.y;
        const z = context.z;
        
        // First rotate around X
        const x1 = x;
        const y1 = y * cx - z * sx;
        const z1 = y * sx + z * cx;
        
        // Then around Y
        const x2 = x1 * cy + z1 * sy;
        const y2 = y1;
        const z2 = -x1 * sy + z1 * cy;
        
        // Finally around Z
        const nx = x2 * cz - y2 * sz;
        const ny = x2 * sz + y2 * cz;
        const nz = z2;
        
        return body.evaluate({...context, x: nx, y: ny, z: nz});
      },
      toGLSL: (context: GLSLContext) => {
        const evalRx = rx.evaluate({});
        const evalRy = ry.evaluate({});
        const evalRz = rz.evaluate({});
        const newContext = context.rotate(evalRx, evalRy, evalRz);
        return body.toGLSL(newContext);
      }
    };
  }

  if (name === 'scale') {
    enforceArgumentLength(name, args, 4);
    const [sx, sy, sz, body] = args;
    return {
      type: 'FunctionCall' as const,
      name,
      args,
      evaluateInterval: (context: Record<string, Interval>) => {
        // Get scale factors
        const scaleX = sx.evaluate({});
        const scaleY = sy.evaluate({});
        const scaleZ = sz.evaluate({});
        
        // Scale the intervals by dividing by scale factors
        const newContext = {...context};
        newContext['x'] = context['x'].divide(Interval.from(scaleX));
        newContext['y'] = context['y'].divide(Interval.from(scaleY));
        newContext['z'] = context['z'].divide(Interval.from(scaleZ));
        
        return body.evaluateInterval(newContext);
      },
      evaluate: (context: Record<string, number>) => {
        const scaleX = sx.evaluate(context);
        const scaleY = sy.evaluate(context);
        const scaleZ = sz.evaluate(context);
        
        return body.evaluate({
          ...context,
          x: context.x / scaleX,
          y: context.y / scaleY,
          z: context.z / scaleZ
        });
      },
      toGLSL: (context: GLSLContext) => {
        const evalSx = sx.evaluate({});
        const evalSy = sy.evaluate({});
        const evalSz = sz.evaluate({});
        const newContext = context.scale(evalSx, evalSy, evalSz);
        return body.toGLSL(newContext);
      }
    };
  }

  if (name === 'translate') {
    enforceArgumentLength(name, args, 4);
    const [dx, dy, dz, body] = args;
    return {
      type: 'FunctionCall' as const,
      name,
      args,
      evaluateInterval: (context: Record<string, Interval>) => {
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
      },
      evaluate: (context: Record<string, number>) => {
        const newX = context['x'] - dx.evaluate(context);
        const newY = context['y'] - dy.evaluate(context);
        const newZ = context['z'] - dz.evaluate(context);
        return body.evaluate({...context, 'x': newX, 'y': newY, 'z': newZ});
      },
      toGLSL: (context: GLSLContext) => {
        const evalDx = dx.evaluate({});
        const evalDy = dy.evaluate({});
        const evalDz = dz.evaluate({});
        const newContext = context.translate(evalDx, evalDy, evalDz);
        return body.toGLSL(newContext);
      }
    };
  }

  if (name === 'max') {
    if (args.length < 1) throw new Error('max requires at least 1 argument');
    return {
      type: 'FunctionCall' as const,
      name,
      args,
      evaluateInterval: (context: Record<string, Interval>) => {
        const intervals = args.map(arg => arg.evaluateInterval(context));
        if (intervals.length === 1) return intervals[0];
        return intervals.reduce((acc, interval) => new Interval(
          Math.max(acc.min, interval.min),
          Math.max(acc.max, interval.max)
        ));
      },
      evaluate: (context: Record<string, number>) => {
        const values = args.map(arg => arg.evaluate(context));
        if (values.length === 1) return values[0];
        return Math.max(...values);
      },
      toGLSL: (context: GLSLContext) => {
        const evalArgs = args.map(arg => arg.toGLSL(context));
        if (evalArgs.length === 1) return evalArgs[0];
        return evalArgs.reduce((acc, arg, i) => {
          if (i === 0) return arg;
          return context.generator.save(`max(${acc}, ${arg})`, 'float');
        });
      }
    };
  }

  if (name === 'smooth_union') {
    enforceArgumentLength(name, args, 3);
    return {
      type: 'FunctionCall' as const,
      name,
      args,
      evaluateInterval: (context: Record<string, Interval>) => {
        const [d1, d2, _r] = args.map(arg => arg.evaluateInterval(context));
        // For interval arithmetic, we use a conservative approximation
        // that encompasses both the smooth and regular union
        return new Interval(
          Math.min(d1.min, d2.min),
          Math.min(d1.max, d2.max)
        );
      },
      evaluate: (context: Record<string, number>) => {
        const [d1, d2, r] = args.map(arg => arg.evaluate(context));
        
        // For points far from both shapes (> 10*radius), just use regular min
        const minDist = Math.min(d1, d2);
        if (minDist > r * 10.0) {
          return Math.min(d1, d2);
        }

        // Otherwise compute the smooth union
        const k = 1.0/r;
        return -Math.log(Math.exp(-k * d1) + Math.exp(-k * d2)) * r;
      },
      toGLSL: (context: GLSLContext) => {
        const evalArgs = args.map(arg => arg.toGLSL(context));
        return context.generator.save(`smooth_union(${evalArgs.join(', ')})`, 'float');
      }
    };
  }

  if (name === 'exp') {
    enforceArgumentLength(name, args, 1);
    return {
      type: 'FunctionCall' as const,
      name,
      args,
      evaluateInterval: (context: Record<string, Interval>) => {
        return args[0].evaluateInterval(context).exp();
      },
      evaluate: (context: Record<string, number>) => {
        return Math.exp(args[0].evaluate(context));
      },
      toGLSL: (context: GLSLContext) => {
        return context.generator.save(`exp(${args[0].toGLSL(context)})`, 'float');
      }
    };
  }

  if (name === 'abs') {
    enforceArgumentLength(name, args, 1);
    return {
      type: 'FunctionCall' as const,
      name,
      args,
      evaluateInterval: (context: Record<string, Interval>) => {
        const x = args[0].evaluateInterval(context);
        if (x.max < 0) {
          return new Interval(-x.max, -x.min);
        } else if (x.min > 0) {
          return x;
        } else {
          return new Interval(0, Math.max(-x.min, x.max));
        }
      },
      evaluate: (context: Record<string, number>) => {
        return Math.abs(args[0].evaluate(context));
      },
      toGLSL: (context: GLSLContext) => {
        return context.generator.save(`abs(${args[0].toGLSL(context)})`, 'float');
      }
    };
  }

  throw new Error(`Unknown function: ${name}`);
}

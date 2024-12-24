import { Node, NumberNode, VariableNode, UnaryOpNode, FunctionCallNode } from './ast';
import { Interval } from '../interval';
import { GLSLContext } from './glslgen';
import { Box3, Vector3 } from 'three';

export function createNumberNode(value: number): NumberNode {
  return {
    type: 'Number',
    value,
    evaluate: (_point: Vector3) => value,
    toGLSL: (context: GLSLContext) => {
      // Format number with at least one decimal place
      const glslNumber = Number.isInteger(value) ? `${value}.0` : value.toString();
      return context.generator.save(glslNumber, 'float');
    },
    evaluateInterval: (_x: Interval, _y: Interval, _z: Interval) => Interval.from(value)
  };
}

function constantValue(node: Node): number {
  if (node.type === 'Number') {
    return (node as NumberNode).value;
  }
  throw new Error('Expected constant numeric value');
}

export function createVariableNode(name: string): VariableNode {
  return {
    type: 'Variable',
    name,
    evaluate: (point: Vector3) => {
      switch (name) {
        case 'x': return point.x;
        case 'y': return point.y;
        case 'z': return point.z;
        default: throw new Error(`Unknown variable: ${name}`);
      }
    },
    evaluateInterval: (x: Interval, y: Interval, z: Interval) => {
      switch (name) {
        case 'x': return x;
        case 'y': return y;
        case 'z': return z;
        default: throw new Error(`Unknown variable: ${name}`);
      }
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

export class BinaryOpNode implements Node {
  readonly type = 'BinaryOp' as const;

  constructor(
    public readonly operator: '+' | '-' | '*' | '/',
    public readonly left: Node,
    public readonly right: Node
  ) {}

  evaluate(point: Vector3): number {
    const lval = this.left.evaluate(point);
    const rval = this.right.evaluate(point);
    switch (this.operator) {
      case '+': return lval + rval;
      case '-': return lval - rval;
      case '*': return lval * rval;
      case '/':
        if (rval === 0) throw new Error('Division by zero');
        return lval / rval;
    }
  }

  toGLSL(context: GLSLContext): string {
    const lval = this.left.toGLSL(context);
    const rval = this.right.toGLSL(context);
    return context.generator.save(`${lval} ${this.operator} ${rval}`, 'float');
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    const lval = this.left.evaluateInterval(x, y, z);
    const rval = this.right.evaluateInterval(x, y, z);
    switch (this.operator) {
      case '+': return lval.add(rval);
      case '-': return lval.subtract(rval);
      case '*': return lval.multiply(rval);
      case '/': return lval.divide(rval);
    }
  }
}

export function createUnaryOpNode(operator: '-', operand: Node): UnaryOpNode {
  return {
    type: 'UnaryOp',
    operator,
    operand,
    evaluate: (point: Vector3) => {
      const val = operand.evaluate(point);
      return -val;
    },
    toGLSL: (context: GLSLContext) => {
      const val = operand.toGLSL(context);
      return context.generator.save(`-${val}`, 'float');
    },
    evaluateInterval: (x: Interval, y: Interval, z: Interval) => {
      const val = operand.evaluateInterval(x, y, z);
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
      type: 'FunctionCall',
      name,
      args,
      evaluateInterval: (x: Interval, y: Interval, z: Interval) => {
        return args[0].evaluateInterval(x, y, z).sin();
      },
      evaluate: (point: Vector3) => {
        return Math.sin(args[0].evaluate(point));
      },
      toGLSL: (context: GLSLContext) => {
        return context.generator.save(`sin(${args[0].toGLSL(context)})`, 'float');
      }
    };
  }

  if (name === 'cos') {
    enforceArgumentLength(name, args, 1);
    return {
      type: 'FunctionCall',
      name,
      args,
      evaluateInterval: (x: Interval, y: Interval, z: Interval) => {
        return args[0].evaluateInterval(x, y, z).cos();
      },
      evaluate: (point: Vector3) => {
        return Math.cos(args[0].evaluate(point));
      },
      toGLSL: (context: GLSLContext) => {
        return context.generator.save(`cos(${args[0].toGLSL(context)})`, 'float');
      }
    };
  }

  if (name === 'sqrt') {
    enforceArgumentLength(name, args, 1);
    return {
      type: 'FunctionCall',
      name,
      args,
      evaluateInterval: (x: Interval, y: Interval, z: Interval) => {
        return args[0].evaluateInterval(x, y, z).sqrt();
      },
      evaluate: (point: Vector3) => {
        return Math.sqrt(args[0].evaluate(point));
      },
      toGLSL: (context: GLSLContext) => {
        return context.generator.save(`sqrt(${args[0].toGLSL(context)})`, 'float');
      }
    };
  }

  if (name === 'sqr') {
    enforceArgumentLength(name, args, 1);
    return {
      type: 'FunctionCall',
      name,
      args,
      evaluateInterval: (x: Interval, y: Interval, z: Interval) => {
        const val = args[0].evaluateInterval(x, y, z);
        return val.multiply(val);
      },
      evaluate: (point: Vector3) => {
        const val = args[0].evaluate(point);
        return val * val;
      },
      toGLSL: (context: GLSLContext) => {
        const val = args[0].toGLSL(context);
        return context.generator.save(`(${val} * ${val})`, 'float');
      }
    };
  }

  if (name === 'log') {
    enforceArgumentLength(name, args, 1);
    return {
      type: 'FunctionCall',
      name,
      args,
      evaluateInterval: (x: Interval, y: Interval, z: Interval) => {
        return args[0].evaluateInterval(x, y, z).log();
      },
      evaluate: (point: Vector3) => {
        return Math.log(args[0].evaluate(point));
      },
      toGLSL: (context: GLSLContext) => {
        return context.generator.save(`log(${args[0].toGLSL(context)})`, 'float');
      }
    };
  }

  if (name === 'min') {
    if (args.length < 1) throw new Error('min requires at least 1 argument');
    return {
      type: 'FunctionCall',
      name,
      args,
      evaluateInterval: (x: Interval, y: Interval, z: Interval) => {
        const intervals = args.map(arg => arg.evaluateInterval(x, y, z));
        if (intervals.length === 1) return intervals[0];
        return intervals.reduce((acc, interval) => new Interval(
          Math.min(acc.min, interval.min),
          Math.min(acc.max, interval.max)
        ));
      },
      evaluate: (point: Vector3) => {
        const values = args.map(arg => arg.evaluate(point));
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
    return new RotateFunctionCall(name, args);
  }

  if (name === 'scale') {
    enforceArgumentLength(name, args, 4);
    const [sx, sy, sz, body] = args;
    return {
      type: 'FunctionCall',
      name,
      args,
      evaluateInterval: (x: Interval, y: Interval, z: Interval) => {
        // Get scale factors
        const scaleX = constantValue(sx);
        const scaleY = constantValue(sy);
        const scaleZ = constantValue(sz);

        return body.evaluateInterval(
          x.divide(Interval.from(scaleX)),
          y.divide(Interval.from(scaleY)),
          z.divide(Interval.from(scaleZ))
        );
      },
      evaluate: (point: Vector3) => {
        const scaleX = sx.evaluate(point);
        const scaleY = sy.evaluate(point);
        const scaleZ = sz.evaluate(point);

        return body.evaluate(new Vector3(
          point.x / scaleX,
          point.y / scaleY,
          point.z / scaleZ
        ));
      },
      toGLSL: (context: GLSLContext) => {
        const evalSx = constantValue(sx);
        const evalSy = constantValue(sy);
        const evalSz = constantValue(sz);
        const newContext = context.scale(evalSx, evalSy, evalSz);
        return body.toGLSL(newContext);
      }
    };
  }

  if (name === 'translate') {
    enforceArgumentLength(name, args, 4);
    const [dx, dy, dz, body] = args;
    return {
      type: 'FunctionCall',
      name,
      args,
      evaluateInterval: (x: Interval, y: Interval, z: Interval) => {
        // Evaluate translation amounts
        const tx = constantValue(dx);
        const ty = constantValue(dy);
        const tz = constantValue(dz);

        // Translate the intervals
        return body.evaluateInterval(
          new Interval(x.min - tx, x.max - tx),
          new Interval(y.min - ty, y.max - ty),
          new Interval(z.min - tz, z.max - tz)
        );
      },
      evaluate: (point: Vector3) => {
        const newX = point.x - constantValue(dx);
        const newY = point.y - constantValue(dy);
        const newZ = point.z - constantValue(dz);

        return body.evaluate(new Vector3(newX, newY, newZ));
      },
      toGLSL: (context: GLSLContext) => {
        const evalDx = constantValue(dx);
        const evalDy = constantValue(dy);
        const evalDz = constantValue(dz);

        const newContext = context.translate(evalDx, evalDy, evalDz);
        return body.toGLSL(newContext);
      }
    };
  }

  if (name === 'max') {
    if (args.length < 1) throw new Error('max requires at least 1 argument');
    return {
      type: 'FunctionCall',
      name,
      args,
      evaluateInterval: (x: Interval, y: Interval, z: Interval) => {
        const intervals = args.map(arg => arg.evaluateInterval(x, y, z));
        if (intervals.length === 1) return intervals[0];
        return intervals.reduce((acc, interval) => new Interval(
          Math.max(acc.min, interval.min),
          Math.max(acc.max, interval.max)
        ));
      },
      evaluate: (point: Vector3) => {
        const values = args.map(arg => arg.evaluate(point));
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
      type: 'FunctionCall',
      name,
      args,
      evaluateInterval: (x: Interval, y: Interval, z: Interval) => {
        const d1 = args[0].evaluateInterval(x, y, z);
        const d2 = args[1].evaluateInterval(x, y, z);
        // const _r = constantValue(args[2]);
        // For interval arithmetic, we use a conservative approximation
        // that encompasses both the smooth and regular union
        return new Interval(
          Math.min(d1.min, d2.min),
          Math.min(d1.max, d2.max)
        );
      },
      evaluate: (point: Vector3) => {
        const d1 = args[0].evaluate(point);
        const d2 = args[1].evaluate(point);
        const r = constantValue(args[2]);

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
      type: 'FunctionCall',
      name,
      args,
      evaluateInterval: (x: Interval, y: Interval, z: Interval) => {
        return args[0].evaluateInterval(x, y, z).exp();
      },
      evaluate: (point: Vector3) => {
        return Math.exp(args[0].evaluate(point));
      },
      toGLSL: (context: GLSLContext) => {
        return context.generator.save(`exp(${args[0].toGLSL(context)})`, 'float');
      }
    };
  }

  if (name === 'abs') {
    enforceArgumentLength(name, args, 1);
    return {
      type: 'FunctionCall',
      name,
      args,
      evaluateInterval: (x: Interval, y: Interval, z: Interval) => {
        const val = args[0].evaluateInterval(x, y, z);
        if (val.max < 0) {
          return new Interval(-val.max, -val.min);
        } else if (val.min > 0) {
          return val;
        } else {
          return new Interval(0, Math.max(-val.min, val.max));
        }
      },
      evaluate: (point: Vector3) => {
        return Math.abs(args[0].evaluate(point));
      },
      toGLSL: (context: GLSLContext) => {
        return context.generator.save(`abs(${args[0].toGLSL(context)})`, 'float');
      }
    };
  }

  if (name === 'aabb') {
    enforceArgumentLength(name, args, 7);
    const [fromx, fromy, fromz, tox, toy, toz, fn] = args;
    
    // Create AABB from constant bounds
    const aabb = new Box3(
      new Vector3(constantValue(fromx), constantValue(fromy), constantValue(fromz)),
      new Vector3(constantValue(tox), constantValue(toy), constantValue(toz))
    );
    
    // Create expanded AABB so that gradients are actually correct when we get close.
    const expanded = aabb.clone();
    const size = new Vector3();
    expanded.getSize(size);
    expanded.expandByVector(size.multiplyScalar(0.2));

    return {
      type: 'FunctionCall',
      name,
      args,
      evaluateInterval: (x: Interval, y: Interval, z: Interval) => {
        // TODO: Implement proper interval arithmetic for AABB distance
        // For now, just evaluate the inner function
        return fn.evaluateInterval(x, y, z);
      },
      evaluate: (point: Vector3) => {
        // If point is inside expanded AABB, use exact SDF
        if (expanded.containsPoint(point)) {
          return fn.evaluate(point);
        }

        // Otherwise return distance to expanded AABB
        return aabb.distanceToPoint(point);
      },
      toGLSL: (context: GLSLContext) => {
        const resultVar = context.generator.freshVar();
        // Initialize result variable
        context.generator.addRaw(`float ${resultVar} = 0.0;`);
        
        // Generate AABB check (`aabb_check` does its own expansion)
        context.generator.addRaw(
          `if (aabb_check(vec3(${aabb.min.x}, ${aabb.min.y}, ${aabb.min.z}), ` +
          `vec3(${aabb.max.x}, ${aabb.max.y}, ${aabb.max.z}), ` +
          `${context.getPoint()}, ${resultVar})) {`
        );
        
        // Inside AABB - evaluate actual function
        const innerResult = fn.toGLSL(context);
        context.generator.addRaw(`  ${resultVar} = ${innerResult};`);
        context.generator.addRaw(`}`);
        
        return resultVar;
      }
    };
  }

  throw new Error(`Unknown function: ${name}`);
}

// TODO maybe everything should be classes
class RotateFunctionCall implements FunctionCallNode {
  readonly type = 'FunctionCall' as const;

  // Cache trig values for evaluateInterval
  #cx: number;
  #sx: number;
  #cy: number;
  #sy: number;
  #cz: number;
  #sz: number;
  #body: Node;

  constructor(
    public readonly name: string,
    public readonly args: Node[],
  ) {
    enforceArgumentLength(name, args, 4);
    const [rx, ry, rz, body] = args;

    // Get rotation angles
    const ax = constantValue(rx);
    const ay = constantValue(ry);
    const az = constantValue(rz);

    // Compute and cache trig values for evaluateInterval
    this.#cx = Math.cos(ax);
    this.#sx = Math.sin(ax);
    this.#cy = Math.cos(ay);
    this.#sy = Math.sin(ay);
    this.#cz = Math.cos(az);
    this.#sz = Math.sin(az);
    this.#body = body;
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    var minX: number = Number.MAX_VALUE, maxX: number = -Number.MAX_VALUE;
    var minY: number = Number.MAX_VALUE, maxY: number = -Number.MAX_VALUE;
    var minZ: number = Number.MAX_VALUE, maxZ: number = -Number.MAX_VALUE;

    // Get corners of the interval box, transform each corner (alloc-free)
    for (var iz = 0; iz < 2; iz++) {
      for (var iy = 0; iy < 2; iy++) {
        for (var ix = 0; ix < 2; ix++) {
          const px = (ix === 0) ? x.min : x.max;
          const py = (iy === 0) ? y.min : y.max;
          const pz = (iz === 0) ? z.min : z.max;

          // First rotate around X
          const x1 = px;
          const y1 = py * this.#cx - pz * this.#sx;
          const z1 = py * this.#sx + pz * this.#cx;

          // Then around Y
          const x2 = x1 * this.#cy + z1 * this.#sy;
          const y2 = y1;
          const z2 = -x1 * this.#sy + z1 * this.#cy;

          // Finally around Z
          const nx = x2 * this.#cz - y2 * this.#sz;
          const ny = x2 * this.#sz + y2 * this.#cz;
          const nz = z2;

          minX = nx < minX ? nx : minX;
          minY = ny < minY ? ny : minY;
          minZ = nz < minZ ? nz : minZ;
          maxX = nx > maxX ? nx : maxX;
          maxY = ny > maxY ? ny : maxY;
          maxZ = nz > maxZ ? nz : maxZ;
        }
      }
    }

    return this.#body.evaluateInterval(
      new Interval(minX!, maxX!),
      new Interval(minY!, maxY!),
      new Interval(minZ!, maxZ!)
    );
  }

  evaluate(point: Vector3): number {
    const [rx, ry, rz] = this.args;
    const ax = rx.evaluate(point);
    const ay = ry.evaluate(point);
    const az = rz.evaluate(point);

    // Compute trig values
    const cx = Math.cos(ax), sx = Math.sin(ax);
    const cy = Math.cos(ay), sy = Math.sin(ay);
    const cz = Math.cos(az), sz = Math.sin(az);

    // First rotate around X
    const x1 = point.x;
    const y1 = point.y * cx - point.z * sx;
    const z1 = point.y * sx + point.z * cx;

    // Then around Y
    const x2 = x1 * cy + z1 * sy;
    const y2 = y1;
    const z2 = -x1 * sy + z1 * cy;

    // Finally around Z
    const nx = x2 * cz - y2 * sz;
    const ny = x2 * sz + y2 * cz;
    const nz = z2;

    return this.#body.evaluate(new Vector3(nx, ny, nz));
  }

  toGLSL(context: GLSLContext): string {
    const [rx, ry, rz] = this.args;
    const evalRx = constantValue(rx);
    const evalRy = constantValue(ry);
    const evalRz = constantValue(rz);
    const newContext = context.rotate(evalRx, evalRy, evalRz);
    return this.#body.toGLSL(newContext);
  }
}

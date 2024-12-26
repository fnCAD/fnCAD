import { Node, Content } from './ast';
import { Interval } from '../interval';
import { GLSLContext } from './glslgen';
import { Box3, Vector3 } from 'three';

function constantValue(node: Node): number {
  if (node instanceof NumberNode) return node.value;
  throw new Error(`Expected constant numeric value, but got ${node}`);
}

export class NumberNode implements Node {
  constructor(public readonly value: number) {}

  evaluate(_point: Vector3): number {
    return this.value;
  }

  toGLSL(context: GLSLContext): string {
    // Format number with at least one decimal place
    const glslNumber = Number.isInteger(this.value) ? `${this.value}.0` : this.value.toString();
    return context.generator.save(glslNumber, 'float');
  }

  evaluateInterval(_x: Interval, _y: Interval, _z: Interval): Interval {
    return Interval.from(this.value);
  }

  evaluateContent(_x: Interval, _y: Interval, _z: Interval): Content { return null; }
}

export class VariableNode implements Node {
  constructor(public readonly name: string) {}

  evaluate(point: Vector3): number {
    switch (this.name) {
      case 'x': return point.x;
      case 'y': return point.y;
      case 'z': return point.z;
      default: throw new Error(`Unknown variable: ${this.name}`);
    }
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    switch (this.name) {
      case 'x': return x;
      case 'y': return y;
      case 'z': return z;
      default: throw new Error(`Unknown variable: ${this.name}`);
    }
  }

  toGLSL(context: GLSLContext): string {
    // Map x,y,z to components of the current point
    if (this.name === 'x') return context.generator.save(`${context.getPoint()}.x`, 'float');
    if (this.name === 'y') return context.generator.save(`${context.getPoint()}.y`, 'float');
    if (this.name === 'z') return context.generator.save(`${context.getPoint()}.z`, 'float');
    return context.generator.save(this.name, 'float');
  }

  evaluateContent(_x: Interval, _y: Interval, _z: Interval): Content { return null; }
}

export class BinaryOpNode implements Node {
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

  evaluateContent(_x: Interval, _y: Interval, _z: Interval): Content { return null; }
}

export class UnaryOpNode implements Node {
  constructor(
    public readonly operator: '-',
    public readonly operand: Node
  ) {}

  evaluate(point: Vector3): number {
    const val = this.operand.evaluate(point);
    return -val;
  }

  toGLSL(context: GLSLContext): string {
    const val = this.operand.toGLSL(context);
    return context.generator.save(`-${val}`, 'float');
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    const val = this.operand.evaluateInterval(x, y, z);
    return val.negate();
  }

  evaluateContent(x: Interval, y: Interval, z: Interval): Content {
    const content = this.operand.evaluateContent(x, y, z);
    if (!content) return null;

    switch (content.category) {
      case 'inside': return { category: 'outside' };
      case 'outside': return { category: 'inside' };
      case 'face': return { category: 'face' };
      case 'edge': return { category: 'edge' };
    }
  }
}

function enforceArgumentLength(name: string, args: Node[], expected: number) {
  if (args.length !== expected) {
    throw new Error(`${name} requires exactly ${expected} argument(s), got ${args.length}`);
  }
}

abstract class FunctionCallNode implements Node {
  constructor(
    public readonly name: string,
    public readonly args: Node[]
  ) { }

  abstract evaluate(point: Vector3): number;
  abstract evaluateInterval(x: Interval, y: Interval, z: Interval): Interval;
  abstract evaluateContent(x: Interval, y: Interval, z: Interval): Content;
  abstract toGLSL(context: GLSLContext): string;
}

export function createFunctionCallNode(name: string, args: Node[]): FunctionCallNode {
  switch (name) {
    case 'sin': return new SinFunctionCall(args);
    case 'cos': return new CosFunctionCall(args);
    case 'sqrt': return new SqrtFunctionCall(args);
    case 'sqr': return new SqrFunctionCall(args);
    case 'log': return new LogFunctionCall(args);
    case 'min': return new MinFunctionCall(args);
    case 'max': return new MaxFunctionCall(args);
    case 'smooth_union': return new SmoothUnionFunctionCall(args);
    case 'exp': return new ExpFunctionCall(args);
    case 'abs': return new AbsFunctionCall(args);
    case 'rotate': return new RotateFunctionCall(args);
    case 'scale': return new ScaleFunctionCall(args);
    case 'translate': return new TranslateFunctionCall(args);
    case 'aabb': return new AABBFunctionCall(args);
    case 'face': return new FaceFunctionCall(args);
    default: throw new Error(`Unknown function: ${name}`);
  }
}

class SinFunctionCall extends FunctionCallNode {
  constructor(args: Node[]) {
    super('sin', args);
    enforceArgumentLength('sin', args, 1);
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    return this.args[0].evaluateInterval(x, y, z).sin();
  }

  evaluate(point: Vector3): number {
    return Math.sin(this.args[0].evaluate(point));
  }

  toGLSL(context: GLSLContext): string {
    return context.generator.save(`sin(${this.args[0].toGLSL(context)})`, 'float');
  }

  evaluateContent(_x: Interval, _y: Interval, _z: Interval): Content { return null; }
}

class CosFunctionCall extends FunctionCallNode {
  constructor(args: Node[]) {
    super('cos', args);
    enforceArgumentLength('cos', args, 1);
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    return this.args[0].evaluateInterval(x, y, z).cos();
  }

  evaluate(point: Vector3): number {
    return Math.cos(this.args[0].evaluate(point));
  }

  toGLSL(context: GLSLContext): string {
    return context.generator.save(`cos(${this.args[0].toGLSL(context)})`, 'float');
  }

  evaluateContent(_x: Interval, _y: Interval, _z: Interval): Content { return null; }
}

class SqrtFunctionCall extends FunctionCallNode {
  constructor(args: Node[]) {
    super('sqrt', args);
    enforceArgumentLength('sqrt', args, 1);
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    return this.args[0].evaluateInterval(x, y, z).sqrt();
  }

  evaluate(point: Vector3): number {
    return Math.sqrt(this.args[0].evaluate(point));
  }

  toGLSL(context: GLSLContext): string {
    return context.generator.save(`sqrt(${this.args[0].toGLSL(context)})`, 'float');
  }

  evaluateContent(_x: Interval, _y: Interval, _z: Interval): Content { return null; }
}

class SqrFunctionCall extends FunctionCallNode {
  constructor(args: Node[]) {
    super('sqr', args);
    enforceArgumentLength('sqr', args, 1);
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    const val = this.args[0].evaluateInterval(x, y, z);
    return val.multiply(val);
  }

  evaluate(point: Vector3): number {
    const val = this.args[0].evaluate(point);
    return val * val;
  }

  toGLSL(context: GLSLContext): string {
    const val = this.args[0].toGLSL(context);
    return context.generator.save(`(${val} * ${val})`, 'float');
  }

  evaluateContent(_x: Interval, _y: Interval, _z: Interval): Content { return null; }
}

class LogFunctionCall extends FunctionCallNode {
  constructor(args: Node[]) {
    super('log', args);
    enforceArgumentLength('log', args, 1);
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    return this.args[0].evaluateInterval(x, y, z).log();
  }

  evaluate(point: Vector3): number {
    return Math.log(this.args[0].evaluate(point));
  }

  toGLSL(context: GLSLContext): string {
    return context.generator.save(`log(${this.args[0].toGLSL(context)})`, 'float');
  }

  evaluateContent(_x: Interval, _y: Interval, _z: Interval): Content { return null; }
}

class MinFunctionCall extends FunctionCallNode {
  constructor(args: Node[]) {
    super('min', args);
    if (args.length < 1) throw new Error('min requires at least 1 argument');
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    const intervals = this.args.map(arg => arg.evaluateInterval(x, y, z));
    if (intervals.length === 1) return intervals[0];
    return intervals.reduce((acc, interval) => new Interval(
      Math.min(acc.min, interval.min),
      Math.min(acc.max, interval.max)
    ));
  }


  evaluate(point: Vector3): number {
    var value = this.args[0].evaluate(point);
    for (var i = 1; i < this.args.length; i++) {
      const nextValue = this.args[i].evaluate(point);
      if (nextValue < value) value = nextValue;
    }
    return value;
  }

  toGLSL(context: GLSLContext): string {
    const evalArgs = this.args.map(arg => arg.toGLSL(context));
    if (evalArgs.length === 1) return evalArgs[0];
    return evalArgs.reduce((acc, arg, i) => {
      if (i === 0) return arg;
      return context.generator.save(`min(${acc}, ${arg})`, 'float');
    });
  }

  evaluateContent(x: Interval, y: Interval, z: Interval): Content {
    // Get content evaluations for all children
    const contents = this.args.map(arg => arg.evaluateContent(x, y, z));

    // If any child is inside, the union is inside
    if (contents.some(c => c?.category === 'inside')) {
      return { category: 'inside' };
    }

    // If any child is edge, the union is edge
    if (contents.some(c => c?.category === 'edge')) {
      return { category: 'edge' };
    }

    // Propagate invalid materials so we can exclude the case going forward.
    if (contents.some(c => c === null)) {
      return null;
    }

    // Count faces
    const faceCount = contents.filter(c => c?.category === 'face').length;
    if (faceCount > 1) {
      return { category: 'edge' };
    }
    if (faceCount === 1) {
      return { category: 'face' };
    }

    // All remaining children must be 'outside'
    return { category: 'outside' };
  }
}

class MaxFunctionCall extends FunctionCallNode {
  constructor(args: Node[]) {
    super('max', args);
    if (args.length < 1) throw new Error('max requires at least 1 argument');
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    const intervals = this.args.map(arg => arg.evaluateInterval(x, y, z));
    if (intervals.length === 1) return intervals[0];
    return intervals.reduce((acc, interval) => new Interval(
      Math.max(acc.min, interval.min),
      Math.max(acc.max, interval.max)
    ));
  }

  evaluate(point: Vector3): number {
    var value = this.args[0].evaluate(point);
    for (var i = 1; i < this.args.length; i++) {
      const nextValue = this.args[i].evaluate(point);
      if (nextValue > value) value = nextValue;
    }
    return value;
  }

  toGLSL(context: GLSLContext): string {
    const evalArgs = this.args.map(arg => arg.toGLSL(context));
    if (evalArgs.length === 1) return evalArgs[0];
    return evalArgs.reduce((acc, arg, i) => {
      if (i === 0) return arg;
      return context.generator.save(`max(${acc}, ${arg})`, 'float');
    });
  }

  evaluateContent(x: Interval, y: Interval, z: Interval): Content {
    // Get content evaluations for all children
    const contents = this.args.map(arg => arg.evaluateContent(x, y, z));

    // If any child is outside, the intersection is outside
    if (contents.some(c => c?.category === 'outside')) {
      return { category: 'outside' };
    }

    // If any child is edge, the intersection is edge
    if (contents.some(c => c?.category === 'edge')) {
      return { category: 'edge' };
    }

    // Count faces
    const faceCount = contents.filter(c => c?.category === 'face').length;
    if (faceCount > 1) {
      return { category: 'edge' };
    }
    if (faceCount === 1) {
      return { category: 'face' };
    }

    // If any child is null, result is null
    if (contents.some(c => c === null)) {
      return null;
    }

    // All remaining children must be 'inside'
    return { category: 'inside' };
  }
}

class SmoothUnionFunctionCall extends FunctionCallNode {
  constructor(args: Node[]) {
    super('smooth_union', args);
    enforceArgumentLength('smooth_union', args, 3);
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    const d1 = this.args[0].evaluateInterval(x, y, z);
    const d2 = this.args[1].evaluateInterval(x, y, z);
    // For now, use a conservative approximation.
    // We know that we have to land *somewhere* between d1 and d2.
    return new Interval(
      Math.min(d1.min, d2.min),
      Math.min(d1.max, d2.max)
    );
  }

  evaluate(point: Vector3): number {
    const d1 = this.args[0].evaluate(point);
    const d2 = this.args[1].evaluate(point);
    const r = constantValue(this.args[2]);

    // For points far from both shapes (> 10*radius), just use regular min
    const minDist = Math.min(d1, d2);
    if (minDist > r * 10.0) {
      return Math.min(d1, d2);
    }

    // Otherwise compute the smooth union
    const k = 1.0/r;
    return -Math.log(Math.exp(-k * d1) + Math.exp(-k * d2)) * r;
  }

  toGLSL(context: GLSLContext): string {
    const evalArgs = this.args.map(arg => arg.toGLSL(context));
    return context.generator.save(`smooth_union(${evalArgs.join(', ')})`, 'float');
  }

  evaluateContent(x: Interval, y: Interval, z: Interval): Content {
    // Use our own evaluateInterval to determine if we contain a potential face
    const interval = this.evaluateInterval(x, y, z);
    if (interval.contains(0)) {
      return { category: 'face' };
    }
    return interval.max < 0 ? { category: 'inside' } : { category: 'outside' };
  }
}

class ExpFunctionCall extends FunctionCallNode {
  constructor(args: Node[]) {
    super('exp', args);
    enforceArgumentLength('exp', args, 1);
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    return this.args[0].evaluateInterval(x, y, z).exp();
  }

  evaluate(point: Vector3): number {
    return Math.exp(this.args[0].evaluate(point));
  }

  toGLSL(context: GLSLContext): string {
    return context.generator.save(`exp(${this.args[0].toGLSL(context)})`, 'float');
  }

  evaluateContent(_x: Interval, _y: Interval, _z: Interval): Content { return null; }
}

class AbsFunctionCall extends FunctionCallNode {
  constructor(args: Node[]) {
    super('abs', args);
    enforceArgumentLength('abs', args, 1);
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    const val = this.args[0].evaluateInterval(x, y, z);
    if (val.max < 0) {
      return new Interval(-val.max, -val.min);
    } else if (val.min > 0) {
      return val;
    } else {
      return new Interval(0, Math.max(-val.min, val.max));
    }
  }

  evaluate(point: Vector3): number {
    return Math.abs(this.args[0].evaluate(point));
  }

  toGLSL(context: GLSLContext): string {
    return context.generator.save(`abs(${this.args[0].toGLSL(context)})`, 'float');
  }

  evaluateContent(_x: Interval, _y: Interval, _z: Interval): Content { return null; }
}

class ScaleFunctionCall extends FunctionCallNode {
  #body: Node;
  #sx: Node;
  #sy: Node;
  #sz: Node;

  constructor(args: Node[]) {
    super('scale', args);
    enforceArgumentLength('scale', args, 4);
    [this.#sx, this.#sy, this.#sz, this.#body] = args;
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    // Get scale factors
    const scaleX = constantValue(this.#sx);
    const scaleY = constantValue(this.#sy);
    const scaleZ = constantValue(this.#sz);

    return this.#body.evaluateInterval(
      x.divide(Interval.from(scaleX)),
      y.divide(Interval.from(scaleY)),
      z.divide(Interval.from(scaleZ))
    );
  }

  evaluate(point: Vector3): number {
    const scaleX = this.#sx.evaluate(point);
    const scaleY = this.#sy.evaluate(point);
    const scaleZ = this.#sz.evaluate(point);

    return this.#body.evaluate(new Vector3(
      point.x / scaleX,
      point.y / scaleY,
      point.z / scaleZ
    ));
  }

  toGLSL(context: GLSLContext): string {
    const evalSx = constantValue(this.#sx);
    const evalSy = constantValue(this.#sy);
    const evalSz = constantValue(this.#sz);
    const newContext = context.scale(evalSx, evalSy, evalSz);
    return this.#body.toGLSL(newContext);
  }

  evaluateContent(x: Interval, y: Interval, z: Interval): Content {
    return this.#body.evaluateContent(
      x.divide(Interval.from(constantValue(this.#sx))),
      y.divide(Interval.from(constantValue(this.#sy))),
      z.divide(Interval.from(constantValue(this.#sz)))
    );
  }
}

class TranslateFunctionCall extends FunctionCallNode {
  #body: Node;
  #dx: Node;
  #dy: Node;
  #dz: Node;

  constructor(args: Node[]) {
    super('translate', args);
    enforceArgumentLength('translate', args, 4);
    [this.#dx, this.#dy, this.#dz, this.#body] = args;
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    // Evaluate translation amounts
    const tx = constantValue(this.#dx);
    const ty = constantValue(this.#dy);
    const tz = constantValue(this.#dz);

    // Translate the intervals
    return this.#body.evaluateInterval(
      new Interval(x.min - tx, x.max - tx),
      new Interval(y.min - ty, y.max - ty),
      new Interval(z.min - tz, z.max - tz)
    );
  }

  evaluate(point: Vector3): number {
    const newX = point.x - constantValue(this.#dx);
    const newY = point.y - constantValue(this.#dy);
    const newZ = point.z - constantValue(this.#dz);

    return this.#body.evaluate(new Vector3(newX, newY, newZ));
  }

  toGLSL(context: GLSLContext): string {
    const evalDx = constantValue(this.#dx);
    const evalDy = constantValue(this.#dy);
    const evalDz = constantValue(this.#dz);

    const newContext = context.translate(evalDx, evalDy, evalDz);
    return this.#body.toGLSL(newContext);
  }

  evaluateContent(x: Interval, y: Interval, z: Interval): Content {
    return this.#body.evaluateContent(
      new Interval(x.min - constantValue(this.#dx), x.max - constantValue(this.#dx)),
      new Interval(y.min - constantValue(this.#dy), y.max - constantValue(this.#dy)),
      new Interval(z.min - constantValue(this.#dz), z.max - constantValue(this.#dz))
    );
  }
}

class AABBFunctionCall extends FunctionCallNode {
  #fn: Node;
  #aabb: Box3;
  #expanded: Box3;

  constructor(args: Node[]) {
    super('aabb', args);
    enforceArgumentLength('aabb', args, 7);
    const [fromx, fromy, fromz, tox, toy, toz, fn] = args;
    this.#fn = fn;

    // Create AABB from constant bounds
    this.#aabb = new Box3(
      new Vector3(constantValue(fromx), constantValue(fromy), constantValue(fromz)),
      new Vector3(constantValue(tox), constantValue(toy), constantValue(toz))
    );

    // Create expanded AABB so that gradients are actually correct when we get close
    this.#expanded = this.#aabb.clone();
    const size = new Vector3();
    this.#expanded.getSize(size);
    this.#expanded.expandByVector(size.multiplyScalar(0.2));
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    // TODO: Implement proper interval arithmetic for AABB distance
    // For now, just evaluate the inner function
    return this.#fn.evaluateInterval(x, y, z);
  }

  evaluate(point: Vector3): number {
    // If point is inside expanded AABB, use exact SDF
    if (this.#expanded.containsPoint(point)) {
      return this.#fn.evaluate(point);
    }

    // Otherwise return distance to expanded AABB
    return this.#aabb.distanceToPoint(point);
  }

  evaluateContent(x: Interval, y: Interval, z: Interval): Content {
    // Quick check - if the interval box is completely outside our AABB, return 'outside'
    if (x.min > this.#aabb.max.x || x.max < this.#aabb.min.x ||
        y.min > this.#aabb.max.y || y.max < this.#aabb.min.y ||
        z.min > this.#aabb.max.z || z.max < this.#aabb.min.z) {
      return { category: 'outside' };
    }

    // Otherwise, delegate to child node
    return this.#fn.evaluateContent(x, y, z);
  }

  toGLSL(context: GLSLContext): string {
    const resultVar = context.generator.freshVar();
    // Initialize result variable
    context.generator.addRaw(`float ${resultVar} = 0.0;`);

    // Generate AABB check (`aabb_check` does its own expansion)
    context.generator.addRaw(
      `if (aabb_check(vec3(${this.#aabb.min.x}, ${this.#aabb.min.y}, ${this.#aabb.min.z}), ` +
      `vec3(${this.#aabb.max.x}, ${this.#aabb.max.y}, ${this.#aabb.max.z}), ` +
      `${context.getPoint()}, ${resultVar})) {`
    );

    // Inside AABB - evaluate actual function
    const innerResult = this.#fn.toGLSL(context);
    context.generator.addRaw(`  ${resultVar} = ${innerResult};`);
    context.generator.addRaw(`}`);

    return resultVar;
  }
}

class FaceFunctionCall extends FunctionCallNode {
  constructor(args: Node[]) {
    super('face', args);
    enforceArgumentLength('face', args, 1);
  }

  evaluate(point: Vector3): number {
    return this.args[0].evaluate(point);
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    return this.args[0].evaluateInterval(x, y, z);
  }

  toGLSL(context: GLSLContext): string {
    return this.args[0].toGLSL(context);
  }

  evaluateContent(x: Interval, y: Interval, z: Interval): Content {
    const interval = this.args[0].evaluateInterval(x, y, z);
    if (interval.contains(0)) {
      return { category: 'face' };
    }
    return interval.max < 0 ? { category: 'inside' } : { category: 'outside' };
  }
}

class RotateFunctionCall extends FunctionCallNode {
  // Cache trig values for evaluateInterval
  #cx: number;
  #sx: number;
  #cy: number;
  #sy: number;
  #cz: number;
  #sz: number;
  #body: Node;

  // Helper to compute rotated intervals
  #rotateInterval(x: Interval, y: Interval, z: Interval): { x: Interval, y: Interval, z: Interval } {
    let minX = Number.MAX_VALUE, maxX = -Number.MAX_VALUE;
    let minY = Number.MAX_VALUE, maxY = -Number.MAX_VALUE;
    let minZ = Number.MAX_VALUE, maxZ = -Number.MAX_VALUE;

    // Transform each corner of the box
    for (let iz = 0; iz < 2; iz++) {
      for (let iy = 0; iy < 2; iy++) {
        for (let ix = 0; ix < 2; ix++) {
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

    return {
      x: new Interval(minX, maxX),
      y: new Interval(minY, maxY),
      z: new Interval(minZ, maxZ)
    };
  }

  constructor(args: Node[]) {
    super('rotate', args);
    enforceArgumentLength('rotate', args, 4);

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
    const rotated = this.#rotateInterval(x, y, z);
    return this.#body.evaluateInterval(rotated.x, rotated.y, rotated.z);
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

  evaluateContent(x: Interval, y: Interval, z: Interval): Content {
    const rotated = this.#rotateInterval(x, y, z);
    return this.#body.evaluateContent(rotated.x, rotated.y, rotated.z);
  }
}

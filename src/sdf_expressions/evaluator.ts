import { Node, Content } from './types';
import { Interval } from '../interval';
import { GLSLContext } from './glslgen';
import { Box3, Vector3 } from 'three';

function constantValue(node: Node): number {
  if (node instanceof NumberNode) return node.value;
  throw new Error(`Expected constant numeric value, but got ${node}`);
}

export class NumberNode extends Node {
  evaluate: (x: number, y: number, z: number) => number;

  constructor(public readonly value: number) {
    super();
    this.evaluate = this.compileEvaluate();
  }

  evaluateStr(_xname: string, _yname: string, _zname: string, _depth: number): string {
    return this.value.toString();
  }

  toGLSL(context: GLSLContext): string {
    // Format number with at least one decimal place
    const glslNumber = Number.isInteger(this.value) ? `${this.value}.0` : this.value.toString();
    return context.generator.save(glslNumber, 'float');
  }

  evaluateInterval(_x: Interval, _y: Interval, _z: Interval): Interval {
    return Interval.from(this.value);
  }

  evaluateContent(_x: Interval, _y: Interval, _z: Interval): Content {
    return null;
  }
}

export class VariableNode extends Node {
  evaluate: (x: number, y: number, z: number) => number;

  constructor(public readonly name: string) {
    super();
    this.evaluate = this.compileEvaluate();
  }

  evaluateStr(xname: string, yname: string, zname: string, _depth: number): string {
    switch (this.name) {
      case 'x':
        return xname;
      case 'y':
        return yname;
      case 'z':
        return zname;
      default:
        throw new Error(`Unknown variable: ${this.name}`);
    }
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    switch (this.name) {
      case 'x':
        return x;
      case 'y':
        return y;
      case 'z':
        return z;
      default:
        throw new Error(`Unknown variable: ${this.name}`);
    }
  }

  toGLSL(context: GLSLContext): string {
    // Map x,y,z to components of the current point
    if (this.name === 'x') return context.generator.save(`${context.getPoint()}.x`, 'float');
    if (this.name === 'y') return context.generator.save(`${context.getPoint()}.y`, 'float');
    if (this.name === 'z') return context.generator.save(`${context.getPoint()}.z`, 'float');
    return context.generator.save(this.name, 'float');
  }

  evaluateContent(_x: Interval, _y: Interval, _z: Interval): Content {
    return null;
  }
}

export class BinaryOpNode extends Node {
  evaluate: (x: number, y: number, z: number) => number;

  constructor(
    public readonly operator: '+' | '-' | '*' | '/',
    public readonly left: Node,
    public readonly right: Node
  ) {
    super();
    this.evaluate = this.compileEvaluate();
  }

  evaluateStr(xname: string, yname: string, zname: string, depth: number): string {
    return `(${this.left.evaluateStr(xname, yname, zname, depth)} ${this.operator} ${this.right.evaluateStr(xname, yname, zname, depth)})`;
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
      case '+':
        return lval.add(rval);
      case '-':
        return lval.subtract(rval);
      case '*':
        return lval.multiply(rval);
      case '/':
        return lval.divide(rval);
    }
  }

  evaluateContent(_x: Interval, _y: Interval, _z: Interval): Content {
    return null;
  }
}

export class UnaryOpNode extends Node {
  evaluate: (x: number, y: number, z: number) => number;

  constructor(
    public readonly operator: '-',
    public readonly operand: Node
  ) {
    super();
    this.evaluate = this.compileEvaluate();
  }

  evaluateStr(xname: string, yname: string, zname: string, depth: number): string {
    return `(-${this.operand.evaluateStr(xname, yname, zname, depth)})`;
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
    const sdfEstimate = content.sdfEstimate.negate();

    switch (content.category) {
      case 'inside':
        return { category: 'outside', sdfEstimate };
      case 'outside':
        return { category: 'inside', sdfEstimate };
      case 'face':
        return { category: 'face', node: content.node, sdfEstimate };
      case 'complex':
        return { category: 'complex', node: content.node, sdfEstimate };
    }
    throw new Error(`internal error: unknown content category ${content.category}`);
  }
}

function enforceArgumentLength(name: string, args: Node[], expected: number) {
  if (args.length !== expected) {
    throw new Error(`${name} requires exactly ${expected} argument(s), got ${args.length}`);
  }
}

abstract class FunctionCallNode extends Node {
  constructor(
    public readonly name: string,
    public readonly args: Node[]
  ) {
    super();
  }

  abstract evaluateStr(xname: string, yname: string, zname: string, depth: number): string;
  abstract evaluateInterval(x: Interval, y: Interval, z: Interval): Interval;
  abstract evaluateContent(x: Interval, y: Interval, z: Interval): Content;
  abstract toGLSL(context: GLSLContext): string;
}

export function createFunctionCallNode(name: string, args: Node[]): FunctionCallNode {
  switch (name) {
    case 'sin':
      return new SinFunctionCall(args);
    case 'cos':
      return new CosFunctionCall(args);
    case 'sqrt':
      return new SqrtFunctionCall(args);
    case 'sqr':
      return new SqrFunctionCall(args);
    case 'log':
      return new LogFunctionCall(args);
    case 'min':
      return new MinFunctionCall(args);
    case 'max':
      return new MaxFunctionCall(args);
    case 'smooth_union':
      return new SmoothUnionFunctionCall(args);
    case 'exp':
      return new ExpFunctionCall(args);
    case 'abs':
      return new AbsFunctionCall(args);
    case 'rotate':
      return new RotateFunctionCall(args);
    case 'scale':
      return new ScaleFunctionCall(args);
    case 'translate':
      return new TranslateFunctionCall(args);
    case 'aabb':
      return new AABBFunctionCall(args);
    case 'face':
      return new FaceFunctionCall(args);
    default:
      throw new Error(`Unknown function: ${name}`);
  }
}

class SinFunctionCall extends FunctionCallNode {
  evaluate: (x: number, y: number, z: number) => number;

  constructor(args: Node[]) {
    super('sin', args);
    enforceArgumentLength('sin', args, 1);
    this.evaluate = this.compileEvaluate();
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    return this.args[0].evaluateInterval(x, y, z).sin();
  }

  evaluateStr(xname: string, yname: string, zname: string, depth: number): string {
    return `Math.sin(${this.args[0].evaluateStr(xname, yname, zname, depth)})`;
  }

  toGLSL(context: GLSLContext): string {
    return context.generator.save(`sin(${this.args[0].toGLSL(context)})`, 'float');
  }

  evaluateContent(_x: Interval, _y: Interval, _z: Interval): Content {
    return null;
  }
}

class CosFunctionCall extends FunctionCallNode {
  evaluate: (x: number, y: number, z: number) => number;

  constructor(args: Node[]) {
    super('cos', args);
    enforceArgumentLength('cos', args, 1);
    this.evaluate = this.compileEvaluate();
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    return this.args[0].evaluateInterval(x, y, z).cos();
  }

  evaluateStr(xname: string, yname: string, zname: string, depth: number): string {
    return `Math.cos(${this.args[0].evaluateStr(xname, yname, zname, depth)})`;
  }

  toGLSL(context: GLSLContext): string {
    return context.generator.save(`cos(${this.args[0].toGLSL(context)})`, 'float');
  }

  evaluateContent(_x: Interval, _y: Interval, _z: Interval): Content {
    return null;
  }
}

class SqrtFunctionCall extends FunctionCallNode {
  evaluate: (x: number, y: number, z: number) => number;

  constructor(args: Node[]) {
    super('sqrt', args);
    enforceArgumentLength('sqrt', args, 1);
    this.evaluate = this.compileEvaluate();
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    return this.args[0].evaluateInterval(x, y, z).sqrt();
  }

  evaluateStr(xname: string, yname: string, zname: string, depth: number): string {
    return `Math.sqrt(${this.args[0].evaluateStr(xname, yname, zname, depth)})`;
  }

  toGLSL(context: GLSLContext): string {
    return context.generator.save(`sqrt(${this.args[0].toGLSL(context)})`, 'float');
  }

  evaluateContent(_x: Interval, _y: Interval, _z: Interval): Content {
    return null;
  }
}

class SqrFunctionCall extends FunctionCallNode {
  evaluate: (x: number, y: number, z: number) => number;

  constructor(args: Node[]) {
    super('sqr', args);
    enforceArgumentLength('sqr', args, 1);
    this.evaluate = this.compileEvaluate();
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    const val = this.args[0].evaluateInterval(x, y, z);
    return val.multiply(val);
  }

  evaluateStr(xname: string, yname: string, zname: string, depth: number): string {
    const arg = this.args[0].evaluateStr(xname, yname, zname, depth);
    return `(${arg} * ${arg})`;
  }

  toGLSL(context: GLSLContext): string {
    const val = this.args[0].toGLSL(context);
    return context.generator.save(`(${val} * ${val})`, 'float');
  }

  evaluateContent(_x: Interval, _y: Interval, _z: Interval): Content {
    return null;
  }
}

class LogFunctionCall extends FunctionCallNode {
  evaluate: (x: number, y: number, z: number) => number;

  constructor(args: Node[]) {
    super('log', args);
    enforceArgumentLength('log', args, 1);
    this.evaluate = this.compileEvaluate();
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    return this.args[0].evaluateInterval(x, y, z).log();
  }

  evaluateStr(xname: string, yname: string, zname: string, depth: number): string {
    return `Math.log(${this.args[0].evaluateStr(xname, yname, zname, depth)})`;
  }

  toGLSL(context: GLSLContext): string {
    return context.generator.save(`log(${this.args[0].toGLSL(context)})`, 'float');
  }

  evaluateContent(_x: Interval, _y: Interval, _z: Interval): Content {
    return null;
  }
}

class MinFunctionCall extends FunctionCallNode {
  evaluate: (x: number, y: number, z: number) => number;

  constructor(args: Node[]) {
    super('min', args);
    if (args.length < 1) throw new Error('min requires at least 1 argument');
    this.evaluate = this.compileEvaluate();
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    const intervals = this.args.map((arg) => arg.evaluateInterval(x, y, z));
    if (intervals.length === 1) return intervals[0];
    return intervals.reduce(
      (acc, interval) =>
        new Interval(Math.min(acc.min, interval.min), Math.min(acc.max, interval.max))
    );
  }

  evaluateStr(xname: string, yname: string, zname: string, depth: number): string {
    return `Math.min(${this.args.map((arg) => arg.evaluateStr(xname, yname, zname, depth)).join(', ')})`;
  }

  toGLSL(context: GLSLContext): string {
    const evalArgs = this.args.map((arg) => arg.toGLSL(context));
    if (evalArgs.length === 1) return evalArgs[0];
    return evalArgs.reduce((acc, arg, i) => {
      if (i === 0) return arg;
      return context.generator.save(`min(${acc}, ${arg})`, 'float');
    });
  }

  evaluateContent(x: Interval, y: Interval, z: Interval): Content {
    // Get content evaluations for all children
    const contents = this.args.map((arg) => arg.evaluateContent(x, y, z));

    // Propagate invalid materials so we can exclude the case going forward.
    if (contents.some((c) => c === null)) {
      return null;
    }

    // Compute SDF estimate from child intervals
    const sdfEstimate = Interval.min(contents.map(c => c!.sdfEstimate));

    // If any child is inside, the union is inside
    if (contents.some((c) => c?.category === 'inside')) {
      return { category: 'inside', sdfEstimate };
    }

    // If any child is complex, the union is complex
    if (contents.some((c) => c?.category === 'complex')) {
      return { category: 'complex', node: this, sdfEstimate };
    }

    // Multiple faces (SDFs with zero transition) = complex
    const faces = contents.filter((c) => c?.category === 'face');
    if (faces.length > 1) {
      return { category: 'complex', node: this, sdfEstimate };
    }

    // One face, but another SDF is closer somewhere = complex
    if (faces.length === 1) {
      const faceInterval = faces[0]!.sdfEstimate;
      const otherIntervals = contents
        .filter((c) => c!.category !== 'face')
        .map((c) => c!.sdfEstimate);

      if (otherIntervals.some(interval => interval.intersects(faceInterval))) {
        return { category: 'complex', node: this, sdfEstimate };
      }
      // One face, closest surface everywhere in the volume: face.
      return { category: 'face', node: faces[0]!.node, sdfEstimate };
    }

    // All remaining children must be 'outside'
    return { category: 'outside', sdfEstimate };
  }
}

class MaxFunctionCall extends FunctionCallNode {
  evaluate: (x: number, y: number, z: number) => number;

  constructor(args: Node[]) {
    super('max', args);
    if (args.length < 1) throw new Error('max requires at least 1 argument');
    this.evaluate = this.compileEvaluate();
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    const intervals = this.args.map((arg) => arg.evaluateInterval(x, y, z));
    if (intervals.length === 1) return intervals[0];
    return intervals.reduce(
      (acc, interval) =>
        new Interval(Math.max(acc.min, interval.min), Math.max(acc.max, interval.max))
    );
  }

  evaluateStr(xname: string, yname: string, zname: string, depth: number): string {
    return `Math.max(${this.args.map((arg) => arg.evaluateStr(xname, yname, zname, depth)).join(', ')})`;
  }

  toGLSL(context: GLSLContext): string {
    const evalArgs = this.args.map((arg) => arg.toGLSL(context));
    if (evalArgs.length === 1) return evalArgs[0];
    return evalArgs.reduce((acc, arg, i) => {
      if (i === 0) return arg;
      return context.generator.save(`max(${acc}, ${arg})`, 'float');
    });
  }

  evaluateContent(x: Interval, y: Interval, z: Interval): Content {
    // Get content evaluations for all children
    const contents = this.args.map((arg) => arg.evaluateContent(x, y, z));

    // If any child is null, result is null
    if (contents.some((c) => c === null)) {
      return null;
    }

    // Compute SDF estimate from child intervals
    const sdfEstimate = Interval.max(contents.map(c => c!.sdfEstimate));

    // If any child is outside, the intersection is outside
    if (contents.some((c) => c!.category === 'outside')) {
      return { category: 'outside', sdfEstimate };
    }

    // If any child is complex, the intersection is complex
    if (contents.some((c) => c!.category === 'complex')) {
      return { category: 'complex', node: this, sdfEstimate };
    }

    // Multiple faces = complex
    const faces = contents.filter((c) => c!.category === 'face');
    if (faces.length > 1) {
      return { category: 'complex', node: this, sdfEstimate };
    }

    // One face, but another SDF overlaps = complex
    if (faces.length === 1) {
      const faceInterval = faces[0]!.sdfEstimate;
      const otherIntervals = contents
        .filter((c) => c!.category !== 'face')
        .map((c) => c!.sdfEstimate);

      if (otherIntervals.some(interval => interval.intersects(faceInterval))) {
        return { category: 'complex', node: this, sdfEstimate };
      }
      // why not faces[0]!.content? is it because this whole content thing is kinda bullshit?
      const faceNode = this.args[contents.findIndex((c) => c!.category === 'face')];
      return { category: 'face', node: faceNode, sdfEstimate };
    }

    // All remaining children must be 'inside'
    return { category: 'inside', sdfEstimate };
  }
}

class SmoothUnionFunctionCall extends FunctionCallNode {
  evaluate: (x: number, y: number, z: number) => number;

  constructor(args: Node[]) {
    super('smooth_union', args);
    enforceArgumentLength('smooth_union', args, 3);
    this.evaluate = this.compileEvaluate();
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    const d1 = this.args[0].evaluateInterval(x, y, z);
    const d2 = this.args[1].evaluateInterval(x, y, z);
    // For now, use a conservative approximation.
    // We know that we have to land *somewhere* between d1 and d2.
    return new Interval(Math.min(d1.min, d2.min), Math.min(d1.max, d2.max));
  }

  evaluateStr(xname: string, yname: string, zname: string, depth: number): string {
    const d1 = this.args[0].evaluateStr(xname, yname, zname, depth);
    const d2 = this.args[1].evaluateStr(xname, yname, zname, depth);
    const r = this.args[2].evaluateStr(xname, yname, zname, depth);
    // TODO move into shared helper
    return `(() => {
      const d1 = ${d1};
      const d2 = ${d2};
      const r = ${r};
      const minDist = Math.min(d1, d2);
      if (minDist > r * 10.0) return Math.min(d1, d2);
      const k = 1.0/r;
      return -Math.log(Math.exp(-k * d1) + Math.exp(-k * d2)) * r;
    })()`;
  }

  toGLSL(context: GLSLContext): string {
    const evalArgs = this.args.map((arg) => arg.toGLSL(context));
    return context.generator.save(`smooth_union(${evalArgs.join(', ')})`, 'float');
  }

  evaluateContent(x: Interval, y: Interval, z: Interval): Content {
    // Use our own evaluateInterval to determine if we contain a potential face
    const interval = this.evaluateInterval(x, y, z);
    if (interval.contains(0)) {
      return {
        category: 'face',
        node: this,
        sdfEstimate: interval,
      };
    }
    return {
      category: interval.max < 0 ? 'inside' : 'outside',
      sdfEstimate: interval,
    };
  }
}

class ExpFunctionCall extends FunctionCallNode {
  evaluate: (x: number, y: number, z: number) => number;

  constructor(args: Node[]) {
    super('exp', args);
    enforceArgumentLength('exp', args, 1);
    this.evaluate = this.compileEvaluate();
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    return this.args[0].evaluateInterval(x, y, z).exp();
  }

  evaluateStr(xname: string, yname: string, zname: string, depth: number): string {
    return `Math.exp(${this.args[0].evaluateStr(xname, yname, zname, depth)})`;
  }

  toGLSL(context: GLSLContext): string {
    return context.generator.save(`exp(${this.args[0].toGLSL(context)})`, 'float');
  }

  evaluateContent(_x: Interval, _y: Interval, _z: Interval): Content {
    return null;
  }
}

class AbsFunctionCall extends FunctionCallNode {
  evaluate: (x: number, y: number, z: number) => number;

  constructor(args: Node[]) {
    super('abs', args);
    enforceArgumentLength('abs', args, 1);
    this.evaluate = this.compileEvaluate();
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

  evaluateStr(xname: string, yname: string, zname: string, depth: number): string {
    return `Math.abs(${this.args[0].evaluateStr(xname, yname, zname, depth)})`;
  }

  toGLSL(context: GLSLContext): string {
    return context.generator.save(`abs(${this.args[0].toGLSL(context)})`, 'float');
  }

  evaluateContent(_x: Interval, _y: Interval, _z: Interval): Content {
    return null;
  }
}

class ScaleFunctionCall extends FunctionCallNode {
  evaluate: (x: number, y: number, z: number) => number;
  #body: Node;
  #sx: Node;
  #sy: Node;
  #sz: Node;

  constructor(args: Node[]) {
    super('scale', args);
    enforceArgumentLength('scale', args, 4);
    [this.#sx, this.#sy, this.#sz, this.#body] = args;
    this.evaluate = this.compileEvaluate();
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

  evaluateStr(xname: string, yname: string, zname: string, depth: number): string {
    const newx = `x${depth}`,
      newy = `y${depth}`,
      newz = `z${depth}`;
    const scaleX = constantValue(this.#sx);
    const scaleY = constantValue(this.#sy);
    const scaleZ = constantValue(this.#sz);
    return `(() => {
      const ${newx} = ${xname} / ${scaleX};
      const ${newy} = ${yname} / ${scaleY};
      const ${newz} = ${zname} / ${scaleZ};
      return ${this.#body.evaluateStr(newx, newy, newz, depth + 1)};
    })()`;
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
  evaluate: (x: number, y: number, z: number) => number;
  #body: Node;
  #dx: Node;
  #dy: Node;
  #dz: Node;

  constructor(args: Node[]) {
    super('translate', args);
    enforceArgumentLength('translate', args, 4);
    [this.#dx, this.#dy, this.#dz, this.#body] = args;
    this.evaluate = this.compileEvaluate();
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

  evaluateStr(xname: string, yname: string, zname: string, depth: number): string {
    const newx = `x${depth}`,
      newy = `y${depth}`,
      newz = `z${depth}`;
    const tx = constantValue(this.#dx);
    const ty = constantValue(this.#dy);
    const tz = constantValue(this.#dz);
    return `(() => {
      const ${newx} = ${xname} - ${tx};
      const ${newy} = ${yname} - ${ty};
      const ${newz} = ${zname} - ${tz};
      return ${this.#body.evaluateStr(newx, newy, newz, depth + 1)};
    })()`;
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
  evaluate: (x: number, y: number, z: number) => number;
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
    this.evaluate = this.compileEvaluate();
  }

  private evaluateAABBDistance(x: Interval, y: Interval, z: Interval): Interval {
    // For each axis, compute distance interval
    const aabb_x = new Interval(this.#aabb.min.x, this.#aabb.max.x);
    const aabb_y = new Interval(this.#aabb.min.y, this.#aabb.max.y);
    const aabb_z = new Interval(this.#aabb.min.z, this.#aabb.max.z);
    const dx = aabb_x.subtract(x),
      dy = aabb_y.subtract(y),
      dz = aabb_z.subtract(z);

    // Return sqrt(dx2 + dy2 + dz2)
    return dx.sqr().add(dy.sqr()).add(dz.sqr()).sqrt();
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    // If query box intersects expanded AABB, delegate to inner function
    if (x.max >= this.#expanded.min.x && x.min <= this.#expanded.max.x &&
        y.max >= this.#expanded.min.y && y.min <= this.#expanded.max.y &&
        z.max >= this.#expanded.min.z && z.min <= this.#expanded.max.z) {
      return this.#fn.evaluateInterval(x, y, z);
    }

    // Otherwise compute distance to AABB
    return this.evaluateAABBDistance(x, y, z);
  }

  evaluateStr(xname: string, yname: string, zname: string, depth: number): string {
    const min = this.#aabb.min;
    const max = this.#aabb.max;
    const emin = this.#expanded.min;
    const emax = this.#expanded.max;
    return `(() => {
      if (${xname} >= ${emin.x} && ${xname} <= ${emax.x} &&
          ${yname} >= ${emin.y} && ${yname} <= ${emax.y} &&
          ${zname} >= ${emin.z} && ${zname} <= ${emax.z}) {
        return ${this.#fn.evaluateStr(xname, yname, zname, depth)};
      }
      const dx = Math.max(${min.x} - ${xname}, 0, ${xname} - ${max.x});
      const dy = Math.max(${min.y} - ${yname}, 0, ${yname} - ${max.y});
      const dz = Math.max(${min.z} - ${zname}, 0, ${zname} - ${max.z});
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    })()`;
  }

  evaluateContent(x: Interval, y: Interval, z: Interval): Content {
    // Quick check - if the interval box is completely outside our AABB, return 'outside'
    if (
      x.min > this.#aabb.max.x ||
      x.max < this.#aabb.min.x ||
      y.min > this.#aabb.max.y ||
      y.max < this.#aabb.min.y ||
      z.min > this.#aabb.max.z ||
      z.max < this.#aabb.min.z
    ) {
      const sdfEstimate = this.evaluateAABBDistance(x, y, z);
      return { category: 'outside', sdfEstimate };
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
  evaluate: (x: number, y: number, z: number) => number;

  constructor(args: Node[]) {
    super('face', args);
    enforceArgumentLength('face', args, 1);
    this.evaluate = this.compileEvaluate();
  }

  evaluateStr(xname: string, yname: string, zname: string, depth: number): string {
    return this.args[0].evaluateStr(xname, yname, zname, depth);
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
      return {
        category: 'face',
        node: this,
        sdfEstimate: interval,
      };
    }
    return {
      category: interval.max < 0 ? 'inside' : 'outside',
      sdfEstimate: interval
    };
  }
}

class RotateFunctionCall extends FunctionCallNode {
  evaluate: (x: number, y: number, z: number) => number;

  // Cache trig values for evaluateInterval
  #cx: number;
  #sx: number;
  #cy: number;
  #sy: number;
  #cz: number;
  #sz: number;
  #body: Node;

  // Helper to compute rotated intervals
  #rotateInterval(
    x: Interval,
    y: Interval,
    z: Interval
  ): { x: Interval; y: Interval; z: Interval } {
    let minX = Number.MAX_VALUE,
      maxX = -Number.MAX_VALUE;
    let minY = Number.MAX_VALUE,
      maxY = -Number.MAX_VALUE;
    let minZ = Number.MAX_VALUE,
      maxZ = -Number.MAX_VALUE;

    // Transform each corner of the box
    for (let iz = 0; iz < 2; iz++) {
      for (let iy = 0; iy < 2; iy++) {
        for (let ix = 0; ix < 2; ix++) {
          const px = ix === 0 ? x.min : x.max;
          const py = iy === 0 ? y.min : y.max;
          const pz = iz === 0 ? z.min : z.max;

          // First rotate around X
          const rx1 = px;
          const ry1 = py * this.#cx - pz * this.#sx;
          const rz1 = py * this.#sx + pz * this.#cx;

          // Then around Y
          const rx2 = rx1 * this.#cy + rz1 * this.#sy;
          const ry2 = ry1;
          const rz2 = -rx1 * this.#sy + rz1 * this.#cy;

          // Finally around Z
          const rx3 = rx2 * this.#cz - ry2 * this.#sz;
          const ry3 = rx2 * this.#sz + ry2 * this.#cz;
          const rz3 = rz2;

          minX = rx3 < minX ? rx3 : minX;
          minY = ry3 < minY ? ry3 : minY;
          minZ = rz3 < minZ ? rz3 : minZ;
          maxX = rx3 > maxX ? rx3 : maxX;
          maxY = ry3 > maxY ? ry3 : maxY;
          maxZ = rz3 > maxZ ? rz3 : maxZ;
        }
      }
    }

    return {
      x: new Interval(minX, maxX),
      y: new Interval(minY, maxY),
      z: new Interval(minZ, maxZ),
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
    this.evaluate = this.compileEvaluate();
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    const rotated = this.#rotateInterval(x, y, z);
    return this.#body.evaluateInterval(rotated.x, rotated.y, rotated.z);
  }

  evaluateStr(xname: string, yname: string, zname: string, depth: number): string {
    const newx = `x${depth + 1}`,
      newy = `y${depth + 1}`,
      newz = `z${depth + 1}`;
    return `(() => {
      const ax = ${this.args[0].evaluateStr(xname, yname, zname, depth)};
      const ay = ${this.args[1].evaluateStr(xname, yname, zname, depth)};
      const az = ${this.args[2].evaluateStr(xname, yname, zname, depth)};
      const cx = Math.cos(ax), sx = Math.sin(ax);
      const cy = Math.cos(ay), sy = Math.sin(ay);
      const cz = Math.cos(az), sz = Math.sin(az);
      const rx1 = ${xname};
      const ry1 = ${yname} * cx - ${zname} * sx;
      const rz1 = ${yname} * sx + ${zname} * cx;
      const rx2 = rx1 * cy + rz1 * sy;
      const ry2 = ry1;
      const rz2 = -rx1 * sy + rz1 * cy;
      const ${newx} = rx2 * cz - ry2 * sz;
      const ${newy} = rx2 * sz + ry2 * cz;
      const ${newz} = rz2;
      return ${this.#body.evaluateStr(newx, newy, newz, depth + 1)};
    })()`;
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

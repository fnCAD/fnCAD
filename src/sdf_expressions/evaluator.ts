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
    return context.save('float', () => glslNumber);
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
    if (this.name === 'x' || this.name === 'y' || this.name === 'z') {
      context.useVar(context.getPoint());
    }
    if (this.name === 'x') return context.save('float', () => `${context.getPoint()}.x`);
    if (this.name === 'y') return context.save('float', () => `${context.getPoint()}.y`);
    if (this.name === 'z') return context.save('float', () => `${context.getPoint()}.z`);
    var self = this;
    return context.save('float', () => self.name);
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
    const lvar = this.left.toGLSL(context);
    const rvar = this.right.toGLSL(context);
    context.useVar(lvar);
    context.useVar(rvar);
    return context.save(
      'float',
      () => `(${context.varExpr(lvar)} ${this.operator} ${context.varExpr(rvar)})`
    );
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
    return `-(${this.operand.evaluateStr(xname, yname, zname, depth)})`;
  }

  toGLSL(context: GLSLContext): string {
    const val = this.operand.toGLSL(context);
    context.useVar(val);
    return context.save('float', () => `-(${context.varExpr(val)})`);
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
        return { category: 'face', node: this, sdfEstimate, minSize: content.minSize };
      case 'complex':
        return { category: 'complex', node: this, sdfEstimate, minSize: content.minSize };
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
    case 'detailed':
      return new DetailedFunctionCall(args);
    case 'atan2':
      return new Atan2FunctionCall(args);
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
    const arg = this.args[0].toGLSL(context);
    context.useVar(arg);
    return context.save('float', () => `sin(${context.varExpr(arg)})`);
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
    const arg = this.args[0].toGLSL(context);
    context.useVar(arg);
    return context.save('float', () => `cos(${context.varExpr(arg)})`);
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
    const arg = this.args[0].toGLSL(context);
    context.useVar(arg);
    return context.save('float', () => `sqrt(${context.varExpr(arg)})`);
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
    context.useVar(val);
    context.useVar(val); // Need to use twice since we multiply it by itself
    return context.save('float', () => `(${context.varExpr(val)} * ${context.varExpr(val)})`);
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
    const arg = this.args[0].toGLSL(context);
    context.useVar(arg);
    return context.save('float', () => `log(${context.varExpr(arg)})`);
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
      context.useVar(acc);
      context.useVar(arg);
      return context.save('float', () => `min(${context.varExpr(acc)}, ${context.varExpr(arg)})`);
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
    const sdfEstimate = Interval.min(...contents.map((c) => c!.sdfEstimate));

    // If any child is inside, the union is inside
    if (contents.some((c) => c!.category === 'inside')) {
      return { category: 'inside', sdfEstimate };
    }

    // Get all face and complex contents to compute minimum feature size
    const minSize = Math.min(
      65536.0,
      ...contents.filter((c) => c!.category === 'face' || c!.category === 'complex').map!(
        (c) => c!.minSize!
      )
    );

    // If any child is complex, the union is complex
    if (contents.some((c) => c!.category === 'complex')) {
      return { category: 'complex', node: this, sdfEstimate, minSize };
    }

    // Multiple faces (SDFs with zero transition) = complex
    const faces = contents.filter((c) => c!.category === 'face');
    if (faces.length > 1) {
      return { category: 'complex', node: this, sdfEstimate, minSize };
    }

    // One face, but another SDF is closer somewhere = complex
    if (faces.length === 1) {
      const faceInterval = faces[0]!.sdfEstimate;
      const otherIntervals = contents
        .filter((c) => c!.category !== 'face')
        .map((c) => c!.sdfEstimate);

      if (otherIntervals.some((interval) => interval.intersects(faceInterval))) {
        return { category: 'complex', node: this, sdfEstimate, minSize };
      }
      // One face, closest surface everywhere in the volume: face.
      return { category: 'face', node: faces[0]!.node, sdfEstimate, minSize };
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
      context.useVar(acc);
      context.useVar(arg);
      return context.save('float', () => `max(${context.varExpr(acc)}, ${context.varExpr(arg)})`);
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
    const sdfEstimate = Interval.max(...contents.map((c) => c!.sdfEstimate));

    // If any child is outside, the intersection is outside
    if (contents.some((c) => c!.category === 'outside')) {
      return { category: 'outside', sdfEstimate };
    }

    // Get all face and complex contents to compute minimum feature size
    const minSize = Math.min(
      65536.0,
      ...contents.filter((c) => c!.category === 'face' || c!.category === 'complex').map!(
        (c) => c!.minSize!
      )
    );

    // If any child is complex, the intersection is complex
    if (contents.some((c) => c!.category === 'complex')) {
      return { category: 'complex', node: this, sdfEstimate, minSize };
    }

    // Multiple faces = complex
    const faces = contents.filter((c) => c!.category === 'face');
    if (faces.length > 1) {
      return { category: 'complex', node: this, sdfEstimate, minSize };
    }

    // One face, but another SDF overlaps = complex
    if (faces.length === 1) {
      const faceInterval = faces[0]!.sdfEstimate;
      const otherIntervals = contents
        .filter((c) => c!.category !== 'face')
        .map((c) => c!.sdfEstimate);

      if (otherIntervals.some((interval) => interval.intersects(faceInterval))) {
        return { category: 'complex', node: this, sdfEstimate, minSize };
      }
      return { category: 'face', node: faces[0]!.node, sdfEstimate, minSize: minSize };
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
    const r = constantValue(this.args[2]);
    return d1.smooth_union(d2, r);
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
      if (minDist > r * 10.0 || minDist < -r * 10.0) return Math.min(d1, d2);
      const k = 1.0/r;
      return -Math.log(Math.exp(-k * d1) + Math.exp(-k * d2)) * r;
    })()`;
  }

  toGLSL(context: GLSLContext): string {
    const evalArgs = this.args.map((arg) => arg.toGLSL(context));
    for (const arg of evalArgs) {
      context.useVar(arg);
    }
    return context.save(
      'float',
      () => `smooth_union(${evalArgs.map((arg) => context.varExpr(arg)).join(', ')})`
    );
  }

  evaluateContent(x: Interval, y: Interval, z: Interval): Content {
    const c1 = this.args[0].evaluateContent(x, y, z);
    const c2 = this.args[1].evaluateContent(x, y, z);
    const r = constantValue(this.args[2]);
    if (!c1 || !c2) return null;

    const interval = c1.sdfEstimate.smooth_union(c2.sdfEstimate, r);
    if (c1.category === 'inside' || c2.category === 'inside') {
      return {
        category: 'inside',
        sdfEstimate: interval,
      };
    }
    const c1face = c1.category === 'face' || c1.category === 'complex';
    const c2face = c2.category === 'face' || c2.category === 'complex';
    const c1dist = c1.sdfEstimate.minDist(0);
    const c2dist = c2.sdfEstimate.minDist(0);
    const nearishC1 = c1face || c1dist < r * 5.0;
    const nearishC2 = c2face || c2dist < r * 5.0;
    if (!nearishC1 && !nearishC2) {
      return {
        category: 'outside',
        sdfEstimate: interval,
      };
    }

    if (nearishC1 && nearishC2) {
      var minSize = r / 5.0;
      if (c1.category === 'face' || c1.category === 'complex')
        minSize = Math.min(minSize, c1.minSize!);
      if (c2.category === 'face' || c2.category === 'complex')
        minSize = Math.min(minSize, c2.minSize!);
      var complex = c1.category === 'complex' || c2.category === 'complex';
      if (interval.contains(0)) {
        return {
          category: complex ? 'complex' : 'face',
          node: this,
          sdfEstimate: interval,
          minSize: minSize,
        };
      }
      return {
        category: interval.max < 0 ? 'inside' : 'outside',
        sdfEstimate: interval,
        minSize: minSize,
      };
    }
    if (nearishC1) {
      // safety margin: on c1, but close enough to c2 that our points would drift into the smooth transition.
      var forceSubdivide = c1face && c2dist > r * 4.0 && c2dist < x.size();
      return {
        ...c1,
        category: forceSubdivide ? 'complex' : c1.category,
        minSize: forceSubdivide ? Math.min(c1.minSize!, 0.1) : c1.minSize,
      };
    }
    if (nearishC2) {
      // safety margin: on c1, but close enough to c2 that our points would drift into the smooth transition.
      var forceSubdivide = c2face && c1dist > r * 4.0 && c1dist < x.size();
      return {
        ...c2,
        category: forceSubdivide ? 'complex' : c2.category,
        minSize: forceSubdivide ? Math.min(c2.minSize!, 0.1) : c2.minSize,
      };
    }
    throw 'unreachable';
  }
}

class Atan2FunctionCall extends FunctionCallNode {
  evaluate: (x: number, y: number, z: number) => number;

  constructor(args: Node[]) {
    super('atan2', args);
    enforceArgumentLength('atan2', args, 2);
    this.evaluate = this.compileEvaluate();
  }

  evaluateStr(xname: string, yname: string, zname: string, depth: number): string {
    const y = this.args[0].evaluateStr(xname, yname, zname, depth);
    const x = this.args[1].evaluateStr(xname, yname, zname, depth);
    return `Math.atan2(${y}, ${x})`;
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    const y_val = this.args[0].evaluateInterval(x, y, z);
    const x_val = this.args[1].evaluateInterval(x, y, z);

    // Sample points in a grid to get tighter bounds
    let min = Infinity;
    let max = -Infinity;
    const grid = 10; // 10x10 grid

    for (let i = 0; i <= grid; i++) {
      const tx = i / grid;
      const x_sample = x_val.min + (x_val.max - x_val.min) * tx;

      for (let j = 0; j <= grid; j++) {
        const ty = j / grid;
        const y_sample = y_val.min + (y_val.max - y_val.min) * ty;

        const angle = Math.atan2(y_sample, x_sample);
        min = Math.min(min, angle);
        max = Math.max(max, angle);
      }
    }

    // Add a small margin to account for sampling error
    const margin = (max - min) * 0.1;
    return new Interval(min - margin, max + margin);
  }

  toGLSL(context: GLSLContext): string {
    const y = this.args[0].toGLSL(context);
    const x = this.args[1].toGLSL(context);
    context.useVar(y);
    context.useVar(x);
    return context.save('float', () => `atan(${context.varExpr(y)}, ${context.varExpr(x)})`);
  }

  evaluateContent(_x: Interval, _y: Interval, _z: Interval): Content {
    return null;
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
    const arg = this.args[0].toGLSL(context);
    context.useVar(arg);
    return context.save('float', () => `exp(${context.varExpr(arg)})`);
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
    const arg = this.args[0].toGLSL(context);
    context.useVar(arg);
    return context.save('float', () => `abs(${context.varExpr(arg)})`);
  }

  evaluateContent(_x: Interval, _y: Interval, _z: Interval): Content {
    return null;
  }
}

class ScaleFunctionCall extends FunctionCallNode {
  evaluate: (x: number, y: number, z: number) => number;
  #body: Node;
  #sx: number;
  #sy: number;
  #sz: number;

  constructor(args: Node[]) {
    super('scale', args);
    enforceArgumentLength('scale', args, 4);
    this.#sx = constantValue(args[0]);
    this.#sy = constantValue(args[1]);
    this.#sz = constantValue(args[2]);
    this.#body = args[3];
    this.evaluate = this.compileEvaluate();
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    return this.#body.evaluateInterval(
      x.divide(Interval.from(this.#sx)),
      y.divide(Interval.from(this.#sy)),
      z.divide(Interval.from(this.#sz))
    );
  }

  evaluateStr(xname: string, yname: string, zname: string, depth: number): string {
    const newx = `x${depth}`,
      newy = `y${depth}`,
      newz = `z${depth}`;
    return `(() => {
      const ${newx} = ${xname} / ${this.#sx};
      const ${newy} = ${yname} / ${this.#sy};
      const ${newz} = ${zname} / ${this.#sz};
      return ${this.#body.evaluateStr(newx, newy, newz, depth + 1)};
    })()`;
  }

  toGLSL(context: GLSLContext): string {
    const newContext = context.scale(this.#sx, this.#sy, this.#sz);
    return this.#body.toGLSL(newContext);
  }

  evaluateContent(x: Interval, y: Interval, z: Interval): Content {
    const result = this.#body.evaluateContent(
      x.divide(Interval.from(this.#sx)),
      y.divide(Interval.from(this.#sy)),
      z.divide(Interval.from(this.#sz))
    );
    if (!result) return null;

    // Scale the minSize by the minimum scale factor
    const minScale = Math.min(this.#sx, this.#sy, this.#sz);

    return {
      category: result.category,
      node: this,
      sdfEstimate: result.sdfEstimate,
      minSize: result.minSize ? result.minSize * minScale : undefined,
    };
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
    const result = this.#body.evaluateContent(
      new Interval(x.min - constantValue(this.#dx), x.max - constantValue(this.#dx)),
      new Interval(y.min - constantValue(this.#dy), y.max - constantValue(this.#dy)),
      new Interval(z.min - constantValue(this.#dz), z.max - constantValue(this.#dz))
    );
    if (!result) return null;
    return {
      category: result.category,
      node: this,
      sdfEstimate: result.sdfEstimate,
      minSize: result.minSize,
    };
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
    if (
      x.max >= this.#expanded.min.x &&
      x.min <= this.#expanded.max.x &&
      y.max >= this.#expanded.min.y &&
      y.min <= this.#expanded.max.y &&
      z.max >= this.#expanded.min.z &&
      z.min <= this.#expanded.max.z
    ) {
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
      x.min > this.#expanded.max.x ||
      x.max < this.#expanded.min.x ||
      y.min > this.#expanded.max.y ||
      y.max < this.#expanded.min.y ||
      z.min > this.#expanded.max.z ||
      z.max < this.#expanded.min.z
    ) {
      const sdfEstimate = this.evaluateAABBDistance(x, y, z);
      return { category: 'outside', sdfEstimate };
    }

    // Otherwise, delegate to child node
    return this.#fn.evaluateContent(x, y, z);
  }

  toGLSL(context: GLSLContext): string {
    const resultVar = context.reserveVar();
    context.useVar(context.getPoint());

    // Initialize result variable
    context.addRaw(`float ${resultVar} = 0.0;`);
    // Generate AABB check (`aabb_check` does its own expansion)
    context.addRaw(
      `if (aabb_check(vec3(${this.#aabb.min.x}, ${this.#aabb.min.y}, ${this.#aabb.min.z}), ` +
        `vec3(${this.#aabb.max.x}, ${this.#aabb.max.y}, ${this.#aabb.max.z}), ` +
        `${context.varExpr(context.getPoint())}, ${resultVar})) {`
    );
    context.generator.indent(2);

    // Inside AABB - evaluate actual function
    const innerResult = this.#fn.toGLSL(context);
    context.useVar(innerResult);
    context.generator.flushVars();
    context.addRaw(`${resultVar} = ${context.varExpr(innerResult)};`);
    context.generator.indent(-2);
    context.addRaw(`}`);

    return resultVar;
  }
}

class DetailedFunctionCall extends FunctionCallNode {
  evaluate: (x: number, y: number, z: number) => number;
  #body: Node;
  #size: number;

  constructor(args: Node[]) {
    super('detailed', args);
    enforceArgumentLength('detailed', args, 2);
    this.#size = constantValue(args[0]);
    this.#body = args[1];
    this.evaluate = this.compileEvaluate();
  }

  evaluateStr(xname: string, yname: string, zname: string, depth: number): string {
    return this.#body.evaluateStr(xname, yname, zname, depth);
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    return this.#body.evaluateInterval(x, y, z);
  }

  toGLSL(context: GLSLContext): string {
    return this.#body.toGLSL(context);
  }

  evaluateContent(x: Interval, y: Interval, z: Interval): Content {
    const result = this.#body.evaluateContent(x, y, z);
    if (!result) return null;

    // Override minSize if this is a face or complex region
    if (result.category === 'face' || result.category === 'complex') {
      return {
        ...result,
        minSize: this.#size,
      };
    }
    return result;
  }
}

class FaceFunctionCall extends FunctionCallNode {
  evaluate: (x: number, y: number, z: number) => number;

  constructor(args: Node[]) {
    super('face', args);
    enforceArgumentLength('face', args, 2);
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
    const minSize = constantValue(this.args[1]);
    if (interval.contains(0)) {
      return {
        category: 'face',
        node: this,
        sdfEstimate: interval,
        minSize,
      };
    }
    return {
      category: interval.max < 0 ? 'inside' : 'outside',
      sdfEstimate: interval,
    };
  }
}

import { RotationUtils } from '../utils/rotation';

class RotateFunctionCall extends FunctionCallNode {
  evaluate: (x: number, y: number, z: number) => number;
  #body: Node;
  #rx: number;
  #ry: number;
  #rz: number;

  constructor(args: Node[]) {
    super('rotate', args);
    enforceArgumentLength('rotate', args, 4);

    const [rx, ry, rz, body] = args;

    // Get rotation angles
    this.#rx = constantValue(rx);
    this.#ry = constantValue(ry);
    this.#rz = constantValue(rz);
    this.#body = body;
    this.evaluate = this.compileEvaluate();
  }

  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval {
    const rotated = RotationUtils.rotateIntervals(x, y, z, this.#rx, this.#ry, this.#rz);
    return this.#body.evaluateInterval(rotated.x, rotated.y, rotated.z);
  }

  evaluateStr(xname: string, yname: string, zname: string, depth: number): string {
    const newx = `x${depth}`,
      newy = `y${depth}`,
      newz = `z${depth}`;
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
    const rotated = RotationUtils.rotateIntervals(x, y, z, this.#rx, this.#ry, this.#rz);
    const result = this.#body.evaluateContent(rotated.x, rotated.y, rotated.z);
    if (!result) return null;
    return {
      category: result.category,
      node: this,
      sdfEstimate: result.sdfEstimate,
      minSize: result.minSize,
    };
  }
}

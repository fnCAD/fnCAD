import { RotationUtils } from '../utils/rotation';

interface PendingVar {
  type: 'float' | 'vec3';
  useCount: number;
  flushed: boolean;
  callback: () => string;
}

export class GLSLGenerator {
  private varCounter = 0;
  private statements: string[] = [];
  private pendingVars: Record<string, PendingVar> = {};
  private indent_: number = 0;

  constructor() {
    this.pendingVars = {};
    this.pendingVars['pos'] = {
      type: 'vec3',
      useCount: 0,
      flushed: true,
      callback: () => 'FAIL',
    };
  }

  // Generate new unique variable name
  private freshVar(): string {
    return `var${++this.varCounter}`;
  }

  save(type: 'float' | 'vec3', callback: () => string): string {
    const varName = this.freshVar();
    const flushed = false;
    this.pendingVars[varName] = {
      type,
      useCount: 0,
      flushed,
      callback,
    };
    return varName;
  }

  reserveVar(): string {
    const varName = this.freshVar();
    this.pendingVars[varName] = {
      type: 'float',
      useCount: 0,
      flushed: true,
      callback: () => 'FAIL',
    };
    return varName;
  }

  // Increment use count for a pending variable
  useVar(name: string): void {
    this.pendingVars[name].useCount++;
  }

  varExpr(name: string): string {
    if (this.pendingVars[name].flushed) {
      return name;
    } else {
      return this.pendingVars[name].callback();
    }
  }

  indent(delta: number) {
    this.indent_ += delta;
  }

  addRaw(stmt: string) {
    this.flushVars();
    this.statements.push(' '.repeat(this.indent_) + stmt);
  }

  flushVars() {
    // Process pending variables
    for (const [name, pending] of Object.entries(this.pendingVars)) {
      if (pending.flushed) {
        continue;
      }
      const expr = pending.callback();
      if (pending.useCount > 1 || expr.length > 40) {
        // Create variable if used multiple times
        this.statements.push(' '.repeat(this.indent_) + `${pending.type} ${name} = ${expr};`);
        this.pendingVars[name].flushed = true;
      }
    }
  }

  // Generate final GLSL code
  generateCode(): string {
    this.flushVars();
    return this.statements.join('\n');
  }
}

export class GLSLContext {
  private readonly currentPoint: string;

  constructor(
    public readonly generator: GLSLGenerator,
    initialPoint: string = 'pos'
  ) {
    this.currentPoint = initialPoint;
  }

  // Create a new context with the same generator but different point
  withPoint(point: string): GLSLContext {
    const ctx = new GLSLContext(this.generator, point);
    return ctx;
  }

  // Get current point variable name
  getPoint(): string {
    return this.currentPoint;
  }

  save(type: 'float' | 'vec3', callback: () => string): string {
    return this.generator.save(type, callback);
  }
  useVar(name: string): void {
    this.generator.useVar(name);
  }
  addRaw(str: string): void {
    return this.generator.addRaw(str);
  }
  varExpr(name: string): string {
    return this.generator.varExpr(name);
  }
  reserveVar(): string {
    return this.generator.reserveVar();
  }

  // Core transformation functions that return new contexts
  translate(dx: number, dy: number, dz: number): GLSLContext {
    this.useVar(this.currentPoint);
    const self = this;
    return this.withPoint(
      this.generator.save('vec3', () => `(${self.currentPoint} - vec3(${dx}, ${dy}, ${dz}))`)
    );
  }

  // Note: MUST remember to scale the result back!
  scale(sx: number, sy: number, sz: number): GLSLContext {
    this.useVar(this.currentPoint);
    const self = this;
    return this.withPoint(
      this.generator.save('vec3', () => `${self.currentPoint} / vec3(${sx}, ${sy}, ${sz})`)
    );
  }

  rotate(ax: number, ay: number, az: number): GLSLContext {
    // Create rotation matrix using our utility
    const rotMatrix = RotationUtils.createRotationMatrix(ax, ay, az);
    const m = rotMatrix.elements;

    // Convert to mat3 for GLSL, taking just the rotation part
    const glslMatrix = `mat3(
      ${formatNum(m[0])}, ${formatNum(m[1])}, ${formatNum(m[2])},
      ${formatNum(m[4])}, ${formatNum(m[5])}, ${formatNum(m[6])},
      ${formatNum(m[8])}, ${formatNum(m[9])}, ${formatNum(m[10])}
    )`;

    this.useVar(this.currentPoint);
    const self = this;
    return this.withPoint(
      this.generator.save('vec3', () => `${glslMatrix} * ${self.varExpr(self.currentPoint)}`)
    );
  }
}

// Helper function to format numbers with consistent precision
function formatNum(n: number): string {
  return n.toFixed(8);
}

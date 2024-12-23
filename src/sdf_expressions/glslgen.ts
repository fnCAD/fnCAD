import * as THREE from 'three';

export class GLSLGenerator {
  private varCounter = 0;
  private statements: string[] = [];

  // Generate new unique variable name
  freshVar(): string {
    return `var${++this.varCounter}`;
  }

  // Save an expression to a new variable and return its name
  save(expr: string, type: 'float' | 'vec3'): string {
    const varName = this.freshVar();
    this.statements.push(`${type} ${varName} = ${expr};`);
    return varName;
  }

  addRaw(stmt: string) {
    this.statements.push(stmt);
  }

  // Generate final GLSL code
  generateCode(): string {
    return this.statements.join('\n');
  }
}

export class GLSLContext {
  private readonly currentPoint: string;

  constructor(
    public readonly generator: GLSLGenerator,
    initialPoint: string = "pos"
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

  // Core transformation functions that return new contexts
  translate(dx: number, dy: number, dz: number): GLSLContext {
    const newPoint = this.generator.save(
      `${this.currentPoint} - vec3(${dx}, ${dy}, ${dz})`, 'vec3'
    );
    return this.withPoint(newPoint);
  }

  scale(sx: number, sy: number, sz: number): GLSLContext {
    const newPoint = this.generator.save(
      `${this.currentPoint} / vec3(${sx}, ${sy}, ${sz})`, 'vec3'
    );
    return this.withPoint(newPoint);
  }

  rotate(ax: number, ay: number, az: number): GLSLContext {
    // Create rotation matrix using THREE.js
    const rotMatrix = new THREE.Matrix4();
    // We use 'ZYX' order for matrix construction because matrix multiplication
    // applies transforms from right to left. This results in the same point 
    // transformations as applying rotations in XYZ order.
    rotMatrix.makeRotationFromEuler(new THREE.Euler(ax, ay, az, 'ZYX'));
    const m = rotMatrix.elements;

    // Format matrix values with consistent precision
    const formatNum = (n: number) => n.toFixed(8);

    // Convert to mat3 for GLSL, taking just the rotation part
    const glslMatrix = `mat3(
      ${formatNum(m[0])}, ${formatNum(m[1])}, ${formatNum(m[2])},
      ${formatNum(m[4])}, ${formatNum(m[5])}, ${formatNum(m[6])},
      ${formatNum(m[8])}, ${formatNum(m[9])}, ${formatNum(m[10])}
    )`;

    const newPoint = this.generator.save(`${glslMatrix} * ${this.currentPoint}`, 'vec3');
    return this.withPoint(newPoint);
  }
}

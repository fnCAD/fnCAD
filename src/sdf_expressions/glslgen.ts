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

  rotate(ax: number, ay: number, az: number): GLSLContext {
    const cx = Math.cos(ax), sx = Math.sin(ax);
    const cy = Math.cos(ay), sy = Math.sin(ay);
    const cz = Math.cos(az), sz = Math.sin(az);

    // Pre-compute the combined rotation matrix
    // Multiply matrices in Z * Y * X order
    const m = [
      cy*cz, cx*sz + sx*sy*cz, sx*sz - cx*sy*cz,
      -cy*sz, cx*cz - sx*sy*sz, sx*cz + cx*sy*sz,
      sy, -sx*cy, cx*cy
    ];

    // Generate the matrix with pre-computed values
    const rotMatrix = `mat3(
      ${m[0]}, ${m[1]}, ${m[2]},
      ${m[3]}, ${m[4]}, ${m[5]},
      ${m[6]}, ${m[7]}, ${m[8]}
    )`;

    const newPoint = this.generator.save(`${rotMatrix} * ${this.currentPoint}`, 'vec3');
    return this.withPoint(newPoint);
  }
}

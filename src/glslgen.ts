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

    // Generate rotation matrices for X, Y, Z in order
    const rotX = `mat3(
      1.0, 0.0, 0.0,
      0.0, ${cx}, ${-sx},
      0.0, ${sx}, ${cx}
    )`;
    const rotY = `mat3(
      ${cy}, 0.0, ${sy},
      0.0, 1.0, 0.0,
      ${-sy}, 0.0, ${cy}
    )`;
    const rotZ = `mat3(
      ${cz}, ${-sz}, 0.0,
      ${sz}, ${cz}, 0.0,
      0.0, 0.0, 1.0
    )`;
    
    // Combine matrices in Z * Y * X order
    const rotMatrix = `(${rotZ} * ${rotY} * ${rotX})`;

    const newPoint = this.generator.save(`${rotMatrix} * ${this.currentPoint}`, 'vec3');
    return this.withPoint(newPoint);
  }
}

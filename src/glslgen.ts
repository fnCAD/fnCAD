export class GLSLGenerator {
  private varCounter = 0;
  private statements: string[] = [];

  // Generate new unique variable name
  freshVar(): string {
    return `var${++this.varCounter}`;
  }

  // Save an expression to a new variable and return its name
  save(expr: string): string {
    const varName = this.freshVar();
    this.statements.push(`vec3 ${varName} = ${expr};`);
    return varName;
  }

  // Generate final GLSL code
  generateCode(): string {
    return this.statements.join('\n');
  }
}

export class GLSLContext {
  private currentPoint: string;

  constructor(
    private generator: GLSLGenerator,
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
      `${this.currentPoint} - vec3(${dx}, ${dy}, ${dz})`
    );
    return this.withPoint(newPoint);
  }

  rotate(ax: number, ay: number, az: number): GLSLContext {
    const cx = Math.cos(ax), sx = Math.sin(ax);
    const cy = Math.cos(ay), sy = Math.sin(ay);
    const cz = Math.cos(az), sz = Math.sin(az);

    const rotMatrix = `mat3(
      ${cy*cz}, ${-cy*sz}, ${sy},
      ${cx*sz + sx*sy*cz}, ${cx*cz - sx*sy*sz}, ${-sx*cy},
      ${sx*sz - cx*sy*cz}, ${sx*cz + cx*sy*sz}, ${cx*cy}
    )`;

    const newPoint = this.generator.save(`${rotMatrix} * ${this.currentPoint}`);
    return this.withPoint(newPoint);
  }
}

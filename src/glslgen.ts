export class GLSLGenerator {
  private varCounter = 0;
  private statements: string[] = [];
  private currentPoint: string;

  constructor(initialPoint: string = "pos") {
    this.currentPoint = initialPoint;
  }

  // Generate new unique variable name
  private freshVar(): string {
    return `var${++this.varCounter}`;
  }

  // Save an expression to a new variable and return its name
  save(expr: string): string {
    const varName = this.freshVar();
    this.statements.push(`vec3 ${varName} = ${expr};`);
    return varName;
  }

  // Get current point variable name
  getPoint(): string {
    return this.currentPoint;
  }

  // Update current point
  setPoint(point: string): void {
    this.currentPoint = point;
  }

  // Core transformation functions
  translate(dx: number, dy: number, dz: number): void {
    this.currentPoint = this.save(`${this.currentPoint} - vec3(${dx}, ${dy}, ${dz})`);
  }

  rotate(ax: number, ay: number, az: number): void {
    // Create rotation matrix
    const cx = Math.cos(ax), sx = Math.sin(ax);
    const cy = Math.cos(ay), sy = Math.sin(ay);
    const cz = Math.cos(az), sz = Math.sin(az);

    // Build rotation matrix components
    const rotMatrix = [
      `mat3(
        ${cy*cz}, ${-cy*sz}, ${sy},
        ${cx*sz + sx*sy*cz}, ${cx*cz - sx*sy*sz}, ${-sx*cy},
        ${sx*sz - cx*sy*cz}, ${sx*cz + cx*sy*sz}, ${cx*cy}
      )`
    ].join('\n');

    this.currentPoint = this.save(`${rotMatrix} * ${this.currentPoint}`);
  }

  // Generate final GLSL code
  generateCode(): string {
    return this.statements.join('\n');
  }
}

export class GLSLContext {
  constructor(
    public readonly point: string,  // The current point variable name
    public readonly scope: string[] = []  // Accumulated GLSL statements
  ) {}

  // Create new context with transformed point
  withPoint(newPoint: string): GLSLContext {
    return new GLSLContext(newPoint, this.scope);
  }

  // Add statement to scope
  addStatement(stmt: string): void {
    this.scope.push(stmt);
  }
}

export class GLSLGenerator {
  private varCounter = 0;
  private statements: string[] = [];

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

  // Core transformation functions
  translate(point: string, dx: number, dy: number, dz: number): string {
    return this.save(`${point} - vec3(${dx}, ${dy}, ${dz})`);
  }

  rotate(point: string, ax: number, ay: number, az: number): string {
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

    return this.save(`${rotMatrix} * ${point}`);
  }

  // Generate final GLSL code
  generateCode(): string {
    return this.statements.join('\n');
  }
}

// Example transformation function that could be used in the middle-end
export function transformPoint(
  gen: GLSLGenerator,
  point: string,
  transform: { 
    translate?: [number, number, number],
    rotate?: [number, number, number]
  }
): string {
  let result = point;
  
  if (transform.translate) {
    const [dx, dy, dz] = transform.translate;
    result = gen.translate(result, dx, dy, dz);
  }
  
  if (transform.rotate) {
    const [rx, ry, rz] = transform.rotate;
    result = gen.rotate(result, rx, ry, rz);
  }
  
  return result;
}

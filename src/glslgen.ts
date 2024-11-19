import * as THREE from 'three';

export class GLSLGenerator {
  private varCounter = 0;
  private statements: string[] = [];

  freshVar(): string {
    return `var${++this.varCounter}`;
  }

  save(expr: string, type: 'float' | 'vec3'): string {
    const varName = this.freshVar();
    this.statements.push(`${type} ${varName} = ${expr};`);
    return varName;
  }

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

  withPoint(point: string): GLSLContext {
    return new GLSLContext(this.generator, point);
  }

  getPoint(): string {
    return this.currentPoint;
  }

  translate(dx: number, dy: number, dz: number): GLSLContext {
    const newPoint = this.generator.save(
      `${this.currentPoint} - vec3(${dx}, ${dy}, ${dz})`, 'vec3'
    );
    return this.withPoint(newPoint);
  }

  rotate(ax: number, ay: number, az: number): GLSLContext {
    const rotMatrix = new THREE.Matrix4();
    rotMatrix.makeRotationFromEuler(new THREE.Euler(ax, ay, az, 'ZYX'));
    const m = rotMatrix.elements;

    const formatNum = (n: number) => n.toFixed(8);
    const glslMatrix = `mat3(
      ${formatNum(m[0])}, ${formatNum(m[1])}, ${formatNum(m[2])},
      ${formatNum(m[4])}, ${formatNum(m[5])}, ${formatNum(m[6])},
      ${formatNum(m[8])}, ${formatNum(m[9])}, ${formatNum(m[10])}
    )`;

    const newPoint = this.generator.save(`${glslMatrix} * ${this.currentPoint}`, 'vec3');
    return this.withPoint(newPoint);
  }
}

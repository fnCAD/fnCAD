export class GLSLContext {
  constructor(
    private readonly point: string = "pos"
  ) {}

  // Create a new context with a different point
  withPoint(point: string): GLSLContext {
    return new GLSLContext(point);
  }

  // Get current point variable name
  getPoint(): string {
    return this.point;
  }
}

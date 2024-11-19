export class ParseError extends Error {
  constructor(
    message: string,
    public location: { start: { line: number, column: number }, end: { line: number, column: number } },
    public source?: string
  ) {
    const lines = this.source.split('\n');
    const line = lines[this.location.start.line - 1];
    const formattedMessage = source ? [
      `at line ${location.start.line}, column ${location.start.column}`,
      line.trim(),
      ' '.repeat(location.start.column - 1) + '^',
      `${location.start.line}:${location.start.column}: ${message}`
    ].join('\n') : `${message} at line ${location.start.line}, column ${location.start.column}`;

    super(formattedMessage);
    this.name = 'ParseError';
  }

  toString(): string {
    if (!this.source) {
      return `${this.name}: ${this.message} at line ${this.location.start.line}, column ${this.location.start.column}`;
    }

    const lines = this.source.split('\n');
    const line = lines[this.location.start.line - 1];
    const pointer = ' '.repeat(this.location.start.column - 1) + '^';
    const context = line.trim();
    
    return [
      `${this.name}: ${this.message}`,
      `at line ${this.location.start.line}, column ${this.location.start.column}`,
      line.trim(),
      ' '.repeat(location.start.column - 1) + '^',
      `${location.start.line}:${location.start.column}: ${message}`
    ].join('\n');
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return this.toString();
  }

  [Symbol.for('vitest.error.customFormatter')](): string {
    return this.toString();
  }
}

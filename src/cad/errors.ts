export class ParseError extends Error {
  constructor(
    message: string,
    public location: { start: { line: number, column: number }, end: { line: number, column: number } },
    public source?: string
  ) {
    const formattedMessage = source ? [
      message,
      `at line ${location.start.line}, column ${location.start.column}`,
      '',
      source.trim(),
      ' '.repeat(location.start.column - 1) + '^',
      '',
      `Source: ${source}`
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
      '',
      context,
      pointer,
      '',
      `Source: ${this.source}`
    ].join('\n');
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return this.toString();
  }

  [Symbol.for('vitest.error.customFormatter')](): string {
    return this.toString();
  }
}

export class ParseError extends Error {
  constructor(
    message: string,
    public location: { start: { line: number, column: number }, end: { line: number, column: number } },
    public source?: string
  ) {
    super(message);
    this.name = 'ParseError';
  }

  toString(): string {
    if (!this.source) {
      return `${this.name}: ${this.message} at line ${this.location.start.line}, column ${this.location.start.column}`;
    }

    const lines = this.source.split('\n');
    const line = lines[this.location.start.line - 1];
    const pointer = ' '.repeat(this.location.start.column - 1) + '^';
    
    return [
      `${this.name}: ${this.message}`,
      `  --> line ${this.location.start.line}, column ${this.location.start.column}`,
      '   |',
      ` ${this.location.start.line} | ${line}`,
      '   | ' + pointer
    ].join('\n');
  }

  toJSON(): object {
    return {
      name: this.name,
      message: this.message,
      location: this.location,
      source: this.source
    };
  }
}

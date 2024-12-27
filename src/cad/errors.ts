export class ParseError extends Error {
  constructor(
    message: string,
    public location: {
      start: { line: number; column: number };
      end: { line: number; column: number };
      source: string;
    }
  ) {
    const lines = location.source.split('\n');
    const currentLine = lines[location.start.line - 1] || '';
    const prevLine = location.start.line > 1 ? lines[location.start.line - 2] : null;
    const nextLine = location.start.line < lines.length ? lines[location.start.line] : null;

    const formattedMessage = [
      message,
      `at line ${location.start.line}, column ${location.start.column}`,
      '',
      prevLine || null,
      currentLine,
      ' '.repeat(location.start.column - 1) + '^',
      nextLine || null,
      '',
    ]
      .filter((line) => line !== null)
      .join('\n');

    super(formattedMessage);
    this.name = 'ParseError';
  }
}

export function parseError(
  message: string,
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
    source: string;
  }
): ParseError {
  return new ParseError(message, location);
}

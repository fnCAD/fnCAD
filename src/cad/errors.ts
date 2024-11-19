export function parseError(
  message: string,
  location: { start: { line: number, column: number }, end: { line: number, column: number } },
  source?: string
): ParseError {
  const lines = source?.split('\n') || [];
  const currentLine = lines[location.start.line - 1] || '';
  const prevLine = location.start.line > 1 ? lines[location.start.line - 2] : null;
  const nextLine = location.start.line < lines.length ? lines[location.start.line] : null;
  
  const formattedMessage = source ? [
    message,
    `at line ${location.start.line}, column ${location.start.column}`,
    '',
    prevLine ? prevLine.trim() : null,
    currentLine.trim(),
    ' '.repeat(location.start.column - 1) + '^',
    nextLine ? nextLine.trim() : null,
    '',
    `Source: ${source}`
  ].filter(line => line !== null).join('\n') : 
  `${message} at line ${location.start.line}, column ${location.start.column}`;

  const error = new ParseError();
  error.name = 'ParseError';
  error.message = formattedMessage;
  error.location = location;
  error.source = source;
  return error;
}

class ParseError extends Error {
  location!: { start: { line: number, column: number }, end: { line: number, column: number } };
  source?: string;
}

/* OpenSCAD-style CAD language parser
 *
 * This parser implements a recursive descent parser for an OpenSCAD-like syntax:
 * - Module declarations: module name(params) { ... }
 * - Module calls: name(args);
 * - Expressions: numbers, identifiers, binary ops
 * - Nested blocks for CSG operations
 */

import {
  Node,
  ModuleDeclaration,
  ModuleCall,
  Expression,
  Parameter,
  Statement,
  BinaryExpression,
  NumberLiteral,
  Identifier,
  SourceLocation,
  ModuleCallLocation,
  ParameterLocation,
  VectorLiteral,
  IndexExpression,
  VariableDeclaration,
  ForLoop,
  AssignmentStatement,
  IfStatement,
  AssertStatement,
} from './types';
import { parseError } from './errors';

/* Parser class implementing recursive descent parsing.
 * The parser maintains state about the current position in the token stream
 * and provides helper methods for consuming tokens and building AST nodes.
 */
export class Parser {
  private current = 0;
  private line = 1;
  private column = 1;
  private tokens: Token[] = [];
  private locations: ModuleCallLocation[] = [];
  private callStack: ModuleCallLocation[] = [];

  constructor(private source: string) {
    this.tokenize();
  }

  private peek(offset = 0): Token {
    const index = this.current + offset;
    if (index >= this.tokens.length) return this.tokens[this.tokens.length - 1];
    return this.tokens[index];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private beginModuleCall(name: string, nameToken: Token) {
    const call: ModuleCallLocation = {
      moduleName: name,
      nameRange: nameToken.location,
      fullRange: {
        start: nameToken.location.start,
        end: nameToken.location.end, // Will be updated when call ends
        source: this.source,
      },
      paramRange: {
        start: { line: 0, column: 0, offset: 0 }, // Will be updated in parseArguments
        end: { line: 0, column: 0, offset: 0 },
        source: this.source,
      },
      parameters: [],
      complete: false,
    };
    this.locations.push(call);
    this.callStack.push(call);
  }

  private endModuleCall(endToken: Token) {
    const call = this.callStack.pop();
    if (call) {
      call.fullRange.end = endToken.location.end;
      call.complete = true;
    }
  }

  getLocations(): ModuleCallLocation[] {
    return this.locations;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.current >= this.tokens.length;
  }

  private check(value: string): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().value === value;
  }

  private match(value: string): boolean {
    if (this.check(value)) {
      this.advance();
      return true;
    }
    return false;
  }

  private expect(value: string, message: string): Token {
    if (this.check(value)) {
      return this.advance();
    }
    // If we're at the end, use the last token's location
    const location = this.isAtEnd() ? this.previous().location : this.peek().location;
    throw parseError(message, location);
  }

  private expectIdentifier(message: string): Token {
    const token = this.peek();
    if (token.type === 'identifier') {
      return this.advance();
    }
    throw parseError(message, token.location);
  }

  /* Tokenize the input source into a stream of tokens.
   * Handles:
   * - Whitespace and newlines for line/column tracking
   * - Numbers (including decimals)
   * - Identifiers and keywords
   * - Single-character tokens (operators, braces, etc)
   */
  private parseVariableDeclaration(): VariableDeclaration {
    const nameToken = this.expectIdentifier('Expected variable name');
    this.expect('=', 'Expected = after variable name');
    const initializer = this.parseExpression();

    return new VariableDeclaration(nameToken.value, initializer, {
      start: nameToken.location.start,
      end: this.previous().location.end,
      source: this.source,
    });
  }

  private tokenize() {
    let current = 0;
    while (current < this.source.length) {
      const char = this.source[current];
      if (this.isWhitespace(char)) {
        this.handleWhitespace(char);
        current++;
        continue;
      }
      if (this.isCommentStart(char, current)) {
        current = this.handleComment(current);
        continue;
      }
      if (this.isNumberStart(char, current)) {
        current = this.handleNumber(current);
        continue;
      }
      if (this.isIdentifierStart(char)) {
        current = this.handleIdentifier(current);
        continue;
      }
      if (this.isSymbolToken(char)) {
        current = this.handleSymbolToken(char, current);
        continue;
      }
      throw parseError(`Unexpected character: ${char}`, this.getTokenLocation(current));
    }
  }

  private isWhitespace(char: string): boolean {
    return /\s/.test(char);
  }

  private handleWhitespace(char: string) {
    if (char === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
  }

  private isCommentStart(char: string, current: number): boolean {
    return (
      char === '/' &&
      current + 1 < this.source.length &&
      (this.source[current + 1] === '/' || this.source[current + 1] === '*')
    );
  }

  private handleComment(start: number): number {
    let current = start;
    const char = this.source[current];
    if (char === '/' && this.source[current + 1] === '/') {
      current += 2;
      while (current < this.source.length && this.source[current] !== '\n') {
        current++;
        this.column++;
      }
    } else if (char === '/' && this.source[current + 1] === '*') {
      current += 2;
      while (current + 1 < this.source.length) {
        if (this.source[current] === '*' && this.source[current + 1] === '/') {
          current += 2;
          this.column += 2;
          break;
        }
        if (this.source[current] === '\n') {
          this.line++;
          this.column = 1;
        } else {
          this.column++;
        }
        current++;
      }
    }
    return current;
  }

  private isNumberStart(char: string, pos: number = 0): boolean {
    return (
      /[0-9-]/.test(char) &&
      (char !== '-' || // Regular digit
        (pos + 1 < this.source.length && /[0-9]/.test(this.source[pos + 1]))) // Negative number
    );
  }

  private handleNumber(start: number): number {
    let current = start;
    let value = '';
    const startColumn = this.column;
    const startOffset = current;

    // Handle negative sign
    if (this.source[current] === '-') {
      value += '-';
      current++;
      this.column++;
    }

    while (current < this.source.length && /[0-9.]/.test(this.source[current])) {
      value += this.source[current];
      current++;
      this.column++;
    }
    this.tokens.push({
      type: 'number',
      value,
      location: {
        start: { line: this.line, column: startColumn, offset: startOffset },
        end: { line: this.line, column: this.column, offset: current },
        source: this.source,
      },
    });
    return current;
  }

  private isIdentifierStart(char: string): boolean {
    return /[a-zA-Z_$]/.test(char);
  }

  private handleIdentifier(start: number): number {
    let current = start;
    let value = '';
    const startColumn = this.column;
    const startOffset = current;
    while (current < this.source.length && /[a-zA-Z0-9_$]/.test(this.source[current])) {
      value += this.source[current];
      current++;
      this.column++;
    }
    this.tokens.push({
      type: 'identifier',
      value,
      location: {
        start: { line: this.line, column: startColumn, offset: startOffset },
        end: { line: this.line, column: this.column, offset: current },
        source: this.source,
      },
    });
    return current;
  }

  private isSymbolToken(char: string): boolean {
    return char in tokenTypes || char === '"';
  }

  private handleStringLiteral(start: number): number {
    let current = start + 1; // Skip opening quote
    let value = '';
    const startColumn = this.column;
    const startOffset = start;

    while (current < this.source.length && this.source[current] !== '"') {
      if (this.source[current] === '\\') {
        current++;
        if (current < this.source.length) {
          value += this.source[current];
        }
      } else {
        value += this.source[current];
      }
      current++;
      this.column++;
    }

    if (current >= this.source.length) {
      throw parseError('Unterminated string literal', this.getTokenLocation(start));
    }

    // Skip closing quote
    current++;
    this.column++;

    this.tokens.push({
      type: 'string',
      value,
      location: {
        start: { line: this.line, column: startColumn, offset: startOffset },
        end: { line: this.line, column: this.column, offset: current },
        source: this.source,
      },
    });
    return current;
  }

  private handleSymbolToken(char: string, current: number): number {
    if (char === '"') {
      return this.handleStringLiteral(current);
    }
    // Check for two-character operators
    const nextChar = current + 1 < this.source.length ? this.source[current + 1] : '';
    let value = char;
    let length = 1;

    if (nextChar) {
      const combined = char + nextChar;
      if (['==', '!=', '<=', '>=', '&&', '||'].includes(combined)) {
        value = combined;
        length = 2;
      }
    }

    this.tokens.push({
      type: tokenTypes[char],
      value,
      location: {
        start: { line: this.line, column: this.column, offset: current },
        end: { line: this.line, column: this.column + length, offset: current + length },
        source: this.source,
      },
    });
    current += length;
    this.column += length;
    return current;
  }

  private getTokenLocation(offset: number): SourceLocation {
    return {
      start: { line: this.line, column: this.column, offset },
      end: { line: this.line, column: this.column + 1, offset: offset + 1 },
      source: this.source,
    };
  }

  /* Main entry point for parsing.
   * Returns an array of top-level nodes (usually module declarations and calls).
   * The nodes are later wrapped in an implicit union() if there are multiple statements.
   */
  parse(): Node[] {
    const nodes: Node[] = [];

    // Skip any remaining tokens (whitespace/comments were already handled in tokenizer)
    while (!this.isAtEnd()) {
      nodes.push(this.parseStatement());
    }

    // Empty input is valid - represents an empty scene
    return nodes;
  }

  private parseStatement(): Node {
    const token = this.peek();
    if (token.type === 'identifier') {
      if (token.value === 'if') {
        return this.parseIfStatement();
      }
      if (token.value === 'for') {
        return this.parseForLoop();
      }
      if (token.value === 'var') {
        this.advance(); // Skip 'var'
        const decl = this.parseVariableDeclaration();
        this.expect(';', 'Expected ; after variable declaration');
        return decl;
      }
      if (token.value === 'module') {
        return this.parseModuleDeclaration();
      }
      if (token.value === 'assert') {
        this.advance(); // consume 'assert'
        this.expect('(', 'Expected ( after assert');
        const condition = this.parseExpression();

        let message: string | undefined;
        if (this.match(',')) {
          message = this.parseStringLiteral();
        }

        this.expect(')', 'Expected )');
        this.expect(';', 'Expected ; after assert statement');

        return new AssertStatement(condition, message, {
          start: token.location.start,
          end: this.previous().location.end,
          source: this.source,
        });
      }

      // Parse as expression first to handle array indexing
      const expr = this.parseExpression();

      // Check for assignment
      if (this.check('=')) {
        if (!(expr instanceof Identifier)) {
          throw parseError('Left side of assignment must be an identifier', expr.location);
        }
        this.advance(); // consume =
        const value = this.parseExpression();
        this.expect(';', 'Expected ; after assignment');
        return new AssignmentStatement(expr.name, value, {
          start: expr.location.start,
          end: this.previous().location.end,
          source: this.source,
        });
      }

      if (this.match(';')) {
        return expr;
      }
      // If no semicolon, treat as module call
      if (expr instanceof ModuleCall) {
        return expr;
      }
      throw parseError(`Expected ; after expression`, this.previous().location);
    }

    if (token.type === 'number') {
      const num = this.advance();
      if (this.match(';')) {
        return new NumberLiteral(parseFloat(num.value), num.location);
      }
    }

    if (token.type === 'semicolon') {
      throw parseError(`Unexpected semicolon`, token.location);
    }
    throw parseError(`Unexpected token type: ${token.type}`, token.location);
  }

  private parseModuleDeclaration(): ModuleDeclaration {
    this.advance(); // Skip 'module' keyword
    const nameToken = this.expectIdentifier('Expected module name');
    const name = nameToken.value;
    const parameters = this.parseParameters();
    const body = this.parseBlock();
    return new ModuleDeclaration(name, parameters, body, {
      start: nameToken.location.start,
      end: this.previous().location.end,
      source: this.source,
    });
  }

  private parseParameters(): Parameter[] {
    this.expect('(', 'Expected (');
    const parameters: Parameter[] = [];

    while (!this.isAtEnd() && !this.check(')')) {
      const nameToken = this.expectIdentifier('Expected parameter name');
      const name = nameToken.value;
      let defaultValue: Expression | undefined;
      if (this.match('=')) {
        defaultValue = this.parseExpression();
      }
      parameters.push({ name, defaultValue });
      this.match(',');
    }

    this.expect(')', 'Expected )');
    return parameters;
  }

  private parseBlock(): Statement[] {
    this.expect('{', 'Expected {');
    const statements: Statement[] = [];

    while (!this.isAtEnd() && !this.check('}')) {
      statements.push(this.parseStatement());
    }

    this.expect('}', 'Expected }');
    return statements;
  }

  private parseStringLiteral(): string {
    const token = this.peek();
    if (token.type !== 'string') {
      throw parseError('Expected string literal', token.location);
    }
    this.advance();
    return token.value;
  }

  private parseModuleCall(name: string, location: SourceLocation): ModuleCall {
    const args = this.parseArguments();

    let children: Statement[] | undefined;

    // Case 1: Block with braces
    if (this.check('{')) {
      this.peek(); // Consume the opening brace
      children = this.parseBlock();
      this.endModuleCall(this.previous());
      return new ModuleCall(name, args, children, {
        start: location.start,
        end: this.previous().location.end,
        source: this.source,
      });
    }

    // Case 2: Empty call with semicolon
    if (this.check(';')) {
      const semicolon = this.advance();
      this.endModuleCall(semicolon);
      return new ModuleCall(name, args, [], {
        start: location.start,
        end: semicolon.location.end,
        source: this.source,
      });
    }

    // Case 3: Single child without braces
    const child = this.parseStatement();
    return new ModuleCall(name, args, [child], {
      start: location.start,
      end: child.location.end,
      source: this.source,
    });
  }

  private parseArguments(): Record<string, Expression> {
    const args: Record<string, Expression> = {};

    // Expect opening paren
    const openParen = this.expect('(', 'Expected (');
    if (this.callStack.length > 0) {
      const currentCall = this.callStack[this.callStack.length - 1];
      currentCall.paramRange.start = {
        line: openParen.location.start.line,
        column: openParen.location.start.column + 1,
        offset: openParen.location.start.offset + 1,
      };
    }

    let firstArg = true;
    while (!this.isAtEnd() && this.peek().value !== ')') {
      if (!firstArg) {
        this.expect(',', 'Expected ,');
      }
      firstArg = false;
      // python comma
      if (!this.isAtEnd() && this.peek().value === ')') break;

      const startToken = this.tokens[this.current];
      let name = '';
      let nameRange: SourceLocation | undefined;
      let value: Expression;

      // Check if we have a named argument
      if (this.current + 1 < this.tokens.length && this.tokens[this.current + 1].value === '=') {
        if (startToken.type !== 'identifier') {
          throw parseError(`Expected parameter name`, startToken.location);
        }
        name = startToken.value;
        nameRange = startToken.location;
        this.current += 2; // Skip name and equals
      }

      // Add to current module call's parameters if we're tracking one
      // default to end of line in case parseExpression fails
      let currentParameter: ParameterLocation | undefined;
      const paramStartPos = startToken.location.start;
      if (this.callStack.length > 0) {
        // Find end of current line for speculative parameter range
        let endOfLine = paramStartPos;
        let lineEnd = this.source.indexOf('\n', paramStartPos.offset);
        if (lineEnd === -1) lineEnd = this.source.length;
        endOfLine = {
          line: paramStartPos.line,
          column: paramStartPos.column + (lineEnd - paramStartPos.offset),
          offset: lineEnd,
        };

        // Update the current call's paramRange.end as a fallback
        this.callStack[this.callStack.length - 1].paramRange.end = endOfLine;

        currentParameter = {
          name: name || String(Object.keys(args).length),
          range: {
            start: paramStartPos,
            end: endOfLine,
            source: this.source,
          },
          nameRange,
        };
        // make the typecheck happy
        if (!currentParameter) throw 'wtf';
        this.callStack[this.callStack.length - 1].parameters.push(currentParameter);
      }

      value = this.parseExpression();
      const valueEndPos = this.previous().location.end;

      // now fill in parameter properly
      if (currentParameter) {
        currentParameter.range.end = valueEndPos;
        currentParameter.value = this.source.substring(paramStartPos.offset, valueEndPos.offset);
      }

      args[name || String(Object.keys(args).length)] = value;
    }

    const closeParen = this.expect(')', 'Expected )');
    if (this.callStack.length > 0) {
      const currentCall = this.callStack[this.callStack.length - 1];
      // End the param range before the closing parenthesis
      currentCall.paramRange.end = {
        line: closeParen.location.end.line,
        column: closeParen.location.end.column - 1,
        offset: closeParen.location.end.offset - 1,
      };
    }

    return args;
  }

  private parseExpression(): Expression {
    return this.parseBinaryExpression();
  }

  private parseBinaryExpression(precedence = 0): Expression {
    const { precedence: operatorPrecedence } = getOperatorPrecedence(this.peek().value);
    if (precedence > operatorPrecedence) {
      return this.parsePrimary();
    }

    let left = this.parseBinaryExpression(operatorPrecedence + 1);

    while (true) {
      const operatorToken = this.peek();
      const { associativity, precedence: currentPrecedence } = getOperatorPrecedence(
        operatorToken.value
      );
      if (
        currentPrecedence < precedence ||
        (associativity === 'left' && currentPrecedence <= precedence) ||
        (associativity === 'right' && currentPrecedence < precedence)
      ) {
        break;
      }
      this.advance();
      const right = this.parseBinaryExpression(currentPrecedence);
      left = new BinaryExpression(operatorToken.value as '+' | '-' | '*' | '/', left, right, {
        start: left.location.start,
        end: right.location.end,
        source: this.source,
      });
    }

    return left;
  }

  private parsePrimary(): Expression {
    if (this.check('[')) {
      return this.parseVectorLiteral();
    }

    // Start with base expression
    let expr: Expression;
    const token = this.advance();

    switch (token.type) {
      case 'number':
        expr = new NumberLiteral(parseFloat(token.value), token.location);
        break;
      case 'string':
        throw parseError('Unexpected string literal', token.location);
      case 'identifier':
        const name = token.value;
        // Handle module call if it's followed by (
        if (this.check('(')) {
          this.beginModuleCall(name, token);
          expr = this.parseModuleCall(name, token.location);
        } else {
          expr = new Identifier(token.value, token.location);
        }
        break;
      default:
        throw parseError(`Unexpected token type: ${token.type}`, token.location);
    }

    // Keep consuming postfix operators ([] for now, could add .property later)
    while (this.check('[')) {
      const startLoc = this.peek().location;
      this.advance(); // consume '['
      const index = this.parseExpression();
      const endToken = this.expect(']', 'Expected ]');
      expr = new IndexExpression(expr, index, {
        start: startLoc.start,
        end: endToken.location.end,
        source: this.source,
      });
    }

    return expr;
  }

  private parseIfStatement(): IfStatement {
    const startLocation = this.peek().location;
    this.advance(); // consume 'if'

    this.expect('(', 'Expected ( after if');
    const condition = this.parseExpression();
    this.expect(')', 'Expected ) after condition');

    const thenBranch = this.parseBlock();

    let elseBranch = null;
    if (this.check('else')) {
      this.advance(); // consume 'else'
      elseBranch = this.parseBlock();
    }

    return new IfStatement(condition, thenBranch, elseBranch, {
      start: startLocation.start,
      end: this.previous().location.end,
      source: this.source,
    });
  }

  private parseForLoop(): ForLoop {
    const startLocation = this.peek().location;
    this.advance(); // consume 'for'

    this.expect('(', 'Expected ( after for');
    this.expect('var', 'Expected var declaration in for loop');

    const varName = this.expectIdentifier('Expected variable name').value;
    this.expect('=', 'Expected = after variable name');

    // Parse range expression [start:end]
    this.expect('[', 'Expected [ for range');
    const start = this.parseExpression();
    this.expect(':', 'Expected : in range');
    const end = this.parseExpression();
    this.expect(']', 'Expected ] after range');

    this.expect(')', 'Expected ) after for header');

    const body = this.parseBlock();

    return new ForLoop(varName, { start, end }, body, {
      start: startLocation.start,
      end: this.previous().location.end,
      source: this.source,
    });
  }

  private parseVectorLiteral(): VectorLiteral {
    const startLocation = this.peek().location;
    this.advance(); // consume '['
    const components: Expression[] = [];
    while (!this.isAtEnd() && this.peek().value !== ']') {
      if (components.length > 0) this.expect(',', 'Expected ,');
      components.push(this.parseExpression());
    }
    if (this.isAtEnd() || this.peek().value !== ']') {
      throw parseError('Unterminated vector literal', startLocation);
    }
    const endToken = this.advance(); // consume ']'
    return new VectorLiteral(components, {
      start: startLocation.start,
      end: endToken.location.end,
      source: this.source,
    });
  }
}

interface Token {
  type: string;
  value: string;
  location: SourceLocation;
}

const tokenTypes: { [key: string]: string } = {
  '(': 'paren',
  ')': 'paren',
  '{': 'brace',
  '}': 'brace',
  '[': 'bracket',
  ']': 'bracket',
  ',': 'comma',
  ';': 'semicolon',
  '=': 'equals',
  ':': 'colon',
  '+': 'operator',
  '-': 'operator',
  '*': 'operator',
  '/': 'operator',
  '<': 'operator',
  '>': 'operator',
  '!': 'operator',
  '&': 'operator',
  '|': 'operator',
};

interface OperatorPrecedence {
  associativity: 'left' | 'right';
  precedence: number;
}

const operatorPrecedence: { [operator: string]: OperatorPrecedence } = {
  '||': { associativity: 'left', precedence: 1 },
  '&&': { associativity: 'left', precedence: 2 },
  '==': { associativity: 'left', precedence: 3 },
  '!=': { associativity: 'left', precedence: 3 },
  '<': { associativity: 'left', precedence: 4 },
  '<=': { associativity: 'left', precedence: 4 },
  '>': { associativity: 'left', precedence: 4 },
  '>=': { associativity: 'left', precedence: 4 },
  '+': { associativity: 'left', precedence: 5 },
  '-': { associativity: 'left', precedence: 5 },
  '*': { associativity: 'left', precedence: 6 },
  '/': { associativity: 'left', precedence: 6 },
};

function getOperatorPrecedence(value: string): OperatorPrecedence {
  return operatorPrecedence[value] || { associativity: 'left', precedence: 0 };
}

export function parse(source: string): Node[] {
  const parser = new Parser(source);

  return parser.parse();
}

import { Node } from './types';
import {
  VariableNode,
  NumberNode,
  RelativeNumberNode,
  BinaryOpNode,
  UnaryOpNode,
  createFunctionCallNode,
} from './evaluator';

class Parser {
  private tokens: string[];
  private current: number = 0;

  constructor(expression: string) {
    // Remove single-line comments
    const noComments = expression.replace(/\/\/.*$/gm, '').trim();

    // Tokenize keeping floating point numbers intact
    this.tokens = noComments
      .replace(/([+\-*/(),])/g, ' $1 ')
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 0);
  }

  parse(): Node {
    return this.expression();
  }

  private expression(): Node {
    return this.additive();
  }

  private additive(): Node {
    let left = this.multiplicative();

    while (this.match('+', '-')) {
      const operator = this.previous();
      const right = this.multiplicative();
      left = new BinaryOpNode(operator as '+' | '-', left, right);
    }

    return left;
  }

  private multiplicative(): Node {
    let left = this.unary();

    while (this.match('*', '/')) {
      const operator = this.previous();
      const right = this.unary();
      left = new BinaryOpNode(operator as '*' | '/', left, right);
    }

    return left;
  }

  private unary(): Node {
    if (this.match('-')) {
      const next = this.unary();
      if (next instanceof NumberNode) {
        return new NumberNode(-next.value);
      }
      return new UnaryOpNode('-', next);
    }

    return this.primary();
  }

  private primary(): Node {
    if (this.isAtEnd()) throw new Error('Unexpected end of expression');

    if (this.isNumber(this.peek())) {
      const num = parseFloat(this.advance());
      return new NumberNode(num);
    }

    if (this.isRelativeNumber(this.peek())) {
      const token = this.advance();
      return new RelativeNumberNode(this.parseRelativeNumber(token));
    }

    if (this.match('(')) {
      const expr = this.expression();
      this.consume(')');
      return expr;
    }

    // Function call or variable
    const identifier = this.advance();
    if (this.match('(')) {
      const args: Node[] = [];
      if (!this.check(')')) {
        do {
          args.push(this.expression());
        } while (this.match(','));
      }
      this.consume(')');
      return createFunctionCallNode(identifier, args);
    }

    return new VariableNode(identifier);
  }

  private match(...tokens: string[]): boolean {
    for (const token of tokens) {
      if (this.check(token)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(token: string): boolean {
    if (this.isAtEnd()) return false;
    return this.peek() === token;
  }

  private advance(): string {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private consume(token: string): string {
    if (this.check(token)) return this.advance();
    throw new Error(`Expected '${token}' but found '${this.peek()}' at position ${this.current}`);
  }

  private isAtEnd(): boolean {
    return this.current >= this.tokens.length;
  }

  private peek(): string {
    return this.tokens[this.current];
  }

  private previous(): string {
    return this.tokens[this.current - 1];
  }

  private isNumber(token: string): boolean {
    return !isNaN(Number(token));
  }

  private isRelativeNumber(token: string): boolean {
    // TODO: Maybe add "by X" syntax in the future as replacement for the removed "Nx" syntax
    return /[0-9\.]+%$/.test(token);
  }

  private parseRelativeNumber(token: string): number {
    if (token.endsWith('%')) {
      return parseFloat(token.slice(0, -1)) / 100.0;
    }
    throw new Error(`Invalid relative number: ${token}`);
  }
}

export function parse(expression: string): Node {
  return new Parser(expression).parse();
}

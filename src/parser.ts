import { Node, NumberNode, VariableNode, BinaryOpNode, UnaryOpNode, FunctionCallNode } from './ast';

class Parser {
  private tokens: string[];
  private current: number = 0;

  constructor(expression: string) {
    // Very simple tokenizer for now
    this.tokens = expression.replace(/([+\-*/(),])/g, ' $1 ')
      .trim()
      .split(/\s+/)
      .filter(t => t.length > 0);
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
      left = {
        type: 'BinaryOp',
        operator: operator as '+' | '-',
        left,
        right
      };
    }

    return left;
  }

  private multiplicative(): Node {
    let left = this.unary();

    while (this.match('*', '/')) {
      const operator = this.previous();
      const right = this.unary();
      left = {
        type: 'BinaryOp',
        operator: operator as '*' | '/',
        left,
        right
      };
    }

    return left;
  }

  private unary(): Node {
    if (this.match('-')) {
      return {
        type: 'UnaryOp',
        operator: '-',
        operand: this.unary()
      };
    }

    return this.primary();
  }

  private primary(): Node {
    if (this.isAtEnd()) throw new Error('Unexpected end of expression');

    if (this.isNumber(this.peek())) {
      const num = parseFloat(this.advance());
      return { type: 'Number', value: num };
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
      return {
        type: 'FunctionCall',
        name: identifier,
        args
      };
    }

    return { type: 'Variable', name: identifier };
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
    throw new Error(`Expected ${token}`);
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
    return !isNaN(parseFloat(token));
  }
}

export function parse(expression: string): Node {
  return new Parser(expression).parse();
}

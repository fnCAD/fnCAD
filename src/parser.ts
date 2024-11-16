import { Node } from './ast';
import { 
  createNumberNode,
  createVariableNode,
  createBinaryOpNode,
  createUnaryOpNode,
  createFunctionCallNode
} from './evaluator';

class Parser {
  private tokens: string[];
  private current: number = 0;

  constructor(expression: string) {
    // Remove single-line comments
    const noComments = expression.replace(/\/\/.*$/gm, '').trim();
    
    // Tokenize keeping floating point numbers intact
    this.tokens = noComments.replace(/([+\-*/(),])/g, ' $1 ')
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
      left = createBinaryOpNode(operator as '+' | '-', left, right);
    }

    return left;
  }

  private multiplicative(): Node {
    let left = this.unary();

    while (this.match('*', '/')) {
      const operator = this.previous();
      const right = this.unary();
      left = createBinaryOpNode(operator as '*' | '/', left, right);
    }

    return left;
  }

  private unary(): Node {
    if (this.match('-')) {
      return createUnaryOpNode('-', this.unary());
    }

    return this.primary();
  }

  private primary(): Node {
    if (this.isAtEnd()) throw new Error('Unexpected end of expression');

    if (this.isNumber(this.peek())) {
      const num = parseFloat(this.advance());
      return createNumberNode(num);
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

    return createVariableNode(identifier);
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
    return !isNaN(parseFloat(token));
  }
}

export function parse(expression: string): Node {
  return new Parser(expression).parse();
}

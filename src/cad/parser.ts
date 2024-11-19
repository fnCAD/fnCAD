import { 
  Node, ModuleDeclaration, ModuleCall, Expression, 
  NumberLiteral, BinaryExpression, Parameter,
  Position, SourceLocation, Statement
} from './types';
import { ParseError, parseError } from './errors';

class Parser {
  private current = 0;
  private line = 1;
  private column = 1;
  private tokens: Token[] = [];

  constructor(private source: string) {
    this.tokenize();
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
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
    throw parseError(message, this.peek().location, this.source);
  }

  private tokenize() {
    let current = 0;
    
    while (current < this.source.length) {
      let char = this.source[current];

      // Skip whitespace
      if (/\s/.test(char)) {
        if (char === '\n') {
          this.line++;
          this.column = 1;
        } else {
          this.column++;
        }
        current++;
        continue;
      }

      // Numbers
      if (/[0-9]/.test(char)) {
        let value = '';
        const start = { line: this.line, column: this.column };

        while (/[0-9.]/.test(char)) {
          value += char;
          current++;
          this.column++;
          char = this.source[current];
        }

        this.tokens.push({
          type: 'number',
          value,
          location: {
            start,
            end: { line: this.line, column: this.column }
          }
        });
        continue;
      }

      // Identifiers and keywords
      if (/[a-zA-Z_]/.test(char)) {
        let value = '';
        const start = { line: this.line, column: this.column };

        while (/[a-zA-Z0-9_]/.test(char)) {
          value += char;
          current++;
          this.column++;
          char = this.source[current];
        }

        this.tokens.push({
          type: 'identifier',
          value,
          location: {
            start,
            end: { line: this.line, column: this.column }
          }
        });
        continue;
      }

      // Single character tokens
      const simpleTokens: Record<string, string> = {
        '(': 'paren',
        ')': 'paren',
        '{': 'brace',
        '}': 'brace',
        '[': 'bracket',
        ']': 'bracket',
        ',': 'comma',
        ';': 'semicolon',
        '=': 'equals',
        '+': 'operator',
        '-': 'operator',
        '*': 'operator',
        '/': 'operator'
      };

      if (char in simpleTokens) {
        this.tokens.push({
          type: simpleTokens[char],
          value: char,
          location: {
            start: { line: this.line, column: this.column },
            end: { line: this.line, column: this.column + 1 }
          }
        });
        current++;
        this.column++;
        continue;
      }

      throw new Error(`Unexpected character: ${char} at line ${this.line}, column ${this.column}`);
    }
  }

  parse(): Node[] {
    const nodes: Node[] = [];
    
    while (this.current < this.tokens.length) {
      nodes.push(this.parseStatement());
    }

    return nodes;
  }

  private parseStatement(): Node {
    const token = this.tokens[this.current];

    if (token.type === 'identifier') {
      if (token.value === 'module') {
        return this.parseModuleDeclaration();
      }
      return this.parseModuleCall();
    }

    if (token.type === 'semicolon') {
      throw parseError(`Unexpected semicolon`, token.location, this.source);
    }
    throw parseError(`Unexpected token type: ${token.type}`, token.location, this.source);
  }

  private parseModuleDeclaration(): ModuleDeclaration {
    const start = this.peek().location.start;
    this.advance(); // Skip 'module' keyword

    const nameToken = this.peek();
    if (nameToken.type !== 'identifier') {
      throw parseError('Expected module name', nameToken.location, this.source);
    }
    const name = nameToken.value;
    this.advance();

    const parameters = this.parseParameters();
    const body = this.parseBlock();

    return {
      type: 'ModuleDeclaration',
      name,
      parameters,
      body,
      location: {
        start,
        end: this.previous().location.end
      }
    };
  }

  private parseParameters(): Parameter[] {
    this.expect('(', 'Expected (');
    const parameters: Parameter[] = [];

    while (!this.isAtEnd() && !this.check(')')) {
      const nameToken = this.peek();
      if (nameToken.type !== 'identifier') {
        throw parseError('Expected parameter name', nameToken.location, this.source);
      }
      this.advance();

      let defaultValue: Expression | undefined;
      if (this.match('=')) {
        defaultValue = this.parseExpression();
      }

      parameters.push({
        name: nameToken.value,
        defaultValue
      });

      this.match(','); // Optional comma
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

  private parseModuleCall(): ModuleCall {
    const start = this.peek().location.start;
    const name = this.peek().value;
    this.advance();

    const args = this.parseArguments();

    let children: Statement[] | undefined;
    if (this.check('{')) {
      children = this.parseBlock();
    } else {
      this.expect(';', 'Expected semicolon');
    }

    return {
      type: 'ModuleCall',
      name,
      arguments: args,
      children,
      location: {
        start,
        end: this.previous().location.end
      }
    };
  }

  private parseArguments(): Record<string, Expression> {
    const args: Record<string, Expression> = {};

    // Expect opening paren
    if (this.tokens[this.current].value !== '(') {
      throw new Error(`Expected ( at ${JSON.stringify(this.tokens[this.current].location)}`);
    }
    this.current++;

    while (this.current < this.tokens.length && this.tokens[this.current].value !== ')') {
      const nameToken = this.tokens[this.current];
      let name = '';
      
      // Check if we have a named argument
      if (this.tokens[this.current + 1].value === '=') {
        if (nameToken.type !== 'identifier') {
          throw new Error(`Expected parameter name at ${JSON.stringify(nameToken.location)}`);
        }
        name = nameToken.value;
        this.current += 2; // Skip name and equals
      }

      const value = this.parseExpression();
      args[name || String(Object.keys(args).length)] = value;

      if (this.tokens[this.current].value === ',') {
        this.current++;
      }
    }

    // Expect closing paren
    if (this.tokens[this.current].value !== ')') {
      throw new ParseError('Expected )', this.tokens[this.current].location, this.source);
    }
    this.current++;

    return args;
  }

  private parseExpression(): Expression {
    let left = this.parsePrimary();

    while (
      this.current < this.tokens.length && 
      this.tokens[this.current].type === 'operator'
    ) {
      const operator = this.tokens[this.current].value as '+' | '-' | '*' | '/';
      this.current++;

      const right = this.parsePrimary();

      left = {
        type: 'BinaryExpression',
        operator,
        left,
        right,
        location: {
          start: left.location.start,
          end: right.location.end
        }
      };
    }

    return left;
  }

  private parsePrimary(): Expression {
    const token = this.tokens[this.current];
    this.current++;

    if (token.type === 'number') {
      return {
        type: 'NumberLiteral',
        value: parseFloat(token.value),
        location: token.location
      };
    }

    if (token.type === 'identifier') {
      return {
        type: 'Identifier',
        name: token.value,
        location: token.location
      };
    }

    throw new Error(`Unexpected token type: ${token.type} at ${JSON.stringify(token.location)}`);
  }
}

interface Token {
  type: string;
  value: string;
  location: SourceLocation;
}

export function parse(source: string): Node[] {
  const parser = new Parser(source);
  return parser.parse();
}

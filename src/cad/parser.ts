import { 
  Node, ModuleDeclaration, ModuleCall, Expression, 
  NumberLiteral, BinaryExpression, Parameter,
  Position, SourceLocation
} from './types';
import { ParseError } from './errors';

class Parser {
  private current = 0;
  private line = 1;
  private column = 1;
  private tokens: Token[] = [];

  constructor(private source: string) {
    this.tokenize();
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

    throw new ParseError(`Unexpected token type: ${token.type}`, token.location, this.source);
  }

  private parseModuleDeclaration(): ModuleDeclaration {
    // Skip 'module' keyword
    const start = this.tokens[this.current].location.start;
    this.current++;

    // Get module name
    const nameToken = this.tokens[this.current];
    if (nameToken.type !== 'identifier') {
      throw new ParseError('Expected module name', nameToken.location, this.source);
    }
    const name = nameToken.value;
    this.current++;

    // Parse parameters
    const parameters = this.parseParameters();

    // Parse body
    const body = this.parseBlock();

    return {
      type: 'ModuleDeclaration',
      name,
      parameters,
      body,
      location: {
        start,
        end: this.tokens[this.current - 1].location.end
      }
    };
  }

  private parseParameters(): Parameter[] {
    // Expect opening paren
    if (this.tokens[this.current].value !== '(') {
      throw new ParseError('Expected (', this.tokens[this.current].location, this.source);
    }
    this.current++;

    const parameters: Parameter[] = [];

    while (this.current < this.tokens.length && this.tokens[this.current].value !== ')') {
      const nameToken = this.tokens[this.current];
      if (nameToken.type !== 'identifier') {
        throw new ParseError('Expected parameter name', nameToken.location, this.source);
      }
      this.current++;

      let defaultValue: Expression | undefined;
      if (this.tokens[this.current].value === '=') {
        this.current++;
        defaultValue = this.parseExpression();
      }

      parameters.push({
        name: nameToken.value,
        defaultValue
      });

      if (this.tokens[this.current].value === ',') {
        this.current++;
      }
    }

    // Expect closing paren
    if (this.tokens[this.current].value !== ')') {
      throw new ParseError('Expected )', this.tokens[this.current].location, this.source);
    }
    this.current++;

    return parameters;
  }

  private parseBlock(): Statement[] {
    // Expect opening brace
    if (this.tokens[this.current].value !== '{') {
      throw new ParseError('Expected {', this.tokens[this.current].location, this.source);
    }
    this.current++;

    const statements: Statement[] = [];

    while (this.current < this.tokens.length && this.tokens[this.current].value !== '}') {
      statements.push(this.parseStatement());
    }

    // Expect closing brace
    if (this.tokens[this.current].value !== '}') {
      throw new ParseError('Expected }', this.tokens[this.current].location, this.source);
    }
    this.current++;

    return statements;
  }

  private parseModuleCall(): ModuleCall {
    const start = this.tokens[this.current].location.start;
    const name = this.tokens[this.current].value;
    this.current++;

    // Parse arguments
    const args = this.parseArguments();

    // Parse optional child block
    let children: Statement[] | undefined;
    if (this.current < this.tokens.length && this.tokens[this.current].value === '{') {
      children = this.parseBlock();
    }

    return {
      type: 'ModuleCall',
      name,
      arguments: args,
      children,
      location: {
        start,
        end: this.tokens[this.current - 1].location.end
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

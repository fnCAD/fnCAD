export interface Position {
  line: number;
  column: number;
}

export interface SourceLocation {
  start: Position;
  end: Position;
}

export interface SourceLocation {
  start: Position;
  end: Position;
}

export interface Node {
  type: string;
  location: SourceLocation;
}

export interface ModuleDeclaration extends Node {
  type: 'ModuleDeclaration';
  name: string;
  parameters: Parameter[];
  body: Statement[];
}

export interface Parameter {
  name: string;
  defaultValue?: Expression;
}

export interface ModuleCall extends Node {
  type: 'ModuleCall';
  name: string;
  arguments: Record<string, Expression>;
  children?: Statement[];
}

export interface Expression extends Node {
  type: 'NumberLiteral' | 'BinaryExpression' | 'Identifier';
  operator?: '+' | '-' | '*' | '/';
  value?: number;
  name?: string;
  left?: Expression;
  right?: Expression;
}

export interface NumberLiteral extends Expression {
  type: 'NumberLiteral';
  value: number;
}

export interface BinaryExpression extends Expression {
  type: 'BinaryExpression';
  operator: '+' | '-' | '*' | '/';
  left: Expression;
  right: Expression;
}

export interface Identifier extends Expression {
  type: 'Identifier';
  name: string;
}

export type Statement = ModuleDeclaration | ModuleCall;

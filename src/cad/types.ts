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
  location: SourceLocation;
}

export interface ModuleDeclaration extends Node {
  kind: 'ModuleDeclaration';
  name: string;
  parameters: Parameter[];
  body: Statement[];
}

export interface Parameter {
  name: string;
  defaultValue?: Expression;
}

export interface ModuleCall extends Node {
  kind: 'ModuleCall';
  name: string;
  arguments: Record<string, Expression>;
  children?: Statement[];
}

export abstract class Expression implements Node {
  constructor(public location: SourceLocation) {}
}

export class NumberLiteral extends Expression {
  constructor(
    public value: number,
    location: SourceLocation
  ) {
    super(location);
  }
}

export class BinaryExpression extends Expression {
  constructor(
    public operator: '+' | '-' | '*' | '/',
    public left: Expression,
    public right: Expression,
    location: SourceLocation
  ) {
    super(location);
  }
}

export class Identifier extends Expression {
  constructor(
    public name: string,
    location: SourceLocation
  ) {
    super(location);
  }
}

export type Statement = ModuleDeclaration | ModuleCall;

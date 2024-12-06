export interface Position {
  line: number;
  column: number;
  offset: number;  // Absolute document position
}

export interface SourceLocation {
  start: Position;
  end: Position;
}


export interface ModuleCallLocation {
  moduleName: string;
  nameRange: SourceLocation;
  fullRange: SourceLocation;
  paramRange: SourceLocation;
  parameters: ParameterLocation[];
  complete: boolean;
}

export interface ParameterLocation {
  name?: string;
  range: SourceLocation;
  nameRange?: SourceLocation;
  value?: string;
}

// Result types for evaluation
export type Value = number | SDFExpression;

export interface SDFExpression {
  type: 'sdf';
  expr: string;
}

// Evaluation context
export class Context {
  constructor(
    private parent?: Context,
    private vars: Map<string, Value> = new Map()
  ) {}

  get(name: string): Value | undefined {
    return this.vars.get(name) ?? this.parent?.get(name);
  }

  set(name: string, value: Value) {
    this.vars.set(name, value);
  }

  child(): Context {
    return new Context(this);
  }
}

export abstract class Node {
  constructor(public location: SourceLocation) {}
}

export abstract class Statement extends Node {}

export class ModuleDeclaration extends Statement {
  constructor(
    public name: string,
    public parameters: Parameter[],
    public body: Statement[],
    location: SourceLocation
  ) {
    super(location);
  }
}

export interface Parameter {
  name: string;
  defaultValue?: Expression;
}

export class ModuleCall extends Statement {

  constructor(
    public name: string,
    public args: Record<string, Expression>,
    public children: Statement[] | undefined,
    location: SourceLocation
  ) {
    super(location);
  }
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


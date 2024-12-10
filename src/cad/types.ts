import { evalExpression } from './builtins';

export interface Position {
  line: number;
  column: number;
  offset: number;  // Absolute document position
}

export interface SourceLocation {
  start: Position;
  end: Position;
  source: string;
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
export type Value = number | SDFExpression | Vector;

export class ScopedModuleDeclaration {
  constructor(
    public declaration: ModuleDeclaration,
    public lexicalContext: Context
  ) {}
}

export class Vector {
  constructor(
    public x: number,
    public y: number,
    public z: number
  ) {}

  static fromArray(arr: number[]): Vector {
    if (arr.length !== 3) {
      throw new Error('Vector requires exactly 3 components');
    }
    return new Vector(arr[0], arr[1], arr[2]);
  }
}

export interface SDFExpression {
  type: 'sdf';
  expr: string;
}

// Evaluation context
export class Context {
  constructor(
    private parent?: Context,
    private vars: Map<string, Value> = new Map(),
    private modules: Map<string, ScopedModuleDeclaration> = new Map()
  ) {}

  get(name: string): Value | undefined {
    return this.vars.get(name) ?? this.parent?.get(name);
  }

  set(name: string, value: Value) {
    this.vars.set(name, value);
  }

  getModule(name: string): ScopedModuleDeclaration | undefined {
    return this.modules.get(name) ?? this.parent?.getModule(name);
  }

  defineModule(name: string, module: ModuleDeclaration) {
    // Capture current context when defining the module
    this.modules.set(name, new ScopedModuleDeclaration(module, this));
  }

  child(): Context {
    return new Context(this, new Map(), this.modules);
  }
}

export abstract class Node {
  constructor(
    public location: SourceLocation
  ) {}
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

export class VectorLiteral extends Expression {
  constructor(
    public components: Expression[],
    location: SourceLocation
  ) {
    super(location);
  }

  evaluate(context: Context): Vector {
    const values = this.components.map(expr => {
      const val = evalExpression(expr, context);
      if (typeof val !== 'number') {
        throw new Error('Vector components must evaluate to numbers');
      }
      return val;
    });
    return new Vector(values[0], values[1], values[2]);
  }
}


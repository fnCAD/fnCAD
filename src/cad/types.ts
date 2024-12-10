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
export type Value = number | SDFExpression | number[];

export class ScopedModuleDeclaration {
  constructor(
    public declaration: ModuleDeclaration,
    public lexicalContext: Context
  ) {}

  call(args: Record<string, Expression>, callContext: Context): SDFExpression {
    // Create new context that inherits from the module's lexical scope
    const moduleContext = this.lexicalContext.child();
    
    // Bind parameters in the new context
    for (const param of this.declaration.parameters) {
      const arg = args[param.name];
      if (arg) {
        moduleContext.set(param.name, evalExpression(arg, callContext));
      } else if (param.defaultValue) {
        moduleContext.set(param.name, evalExpression(param.defaultValue, moduleContext));
      } else {
        throw new Error(`Missing required parameter: ${param.name}`);
      }
    }

    // Evaluate module body in the context
    let result: Value = { type: 'sdf', expr: '0' };
    for (const statement of this.declaration.body) {
      const statementResult = evalCAD(statement, moduleContext);
      if (statementResult !== undefined) {
        result = statementResult;
      }
    }

    // Validate return type
    if (!result || typeof result !== 'object' || result.type !== 'sdf') {
      throw new Error('Module must return an SDF expression');
    }
    return result as SDFExpression;
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

  evaluate(context: Context): number[] {
    return this.components.map(expr => {
      const val = evalExpression(expr, context);
      if (typeof val !== 'number') {
        throw new Error('Vector components must evaluate to numbers');
      }
      return val;
    });
  }
}


import { evalExpression, wrapUnion, flattenScope } from './builtins';

export interface Position {
  line: number;
  column: number;
  offset: number; // Absolute document position
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
export type Value = number | SDFExpression | number[] | SDFGroup;

export interface SDFGroup {
  type: 'group';
  expressions: SDFExpression[];
}

export function isSDFGroup(value: Value): value is SDFGroup {
  return typeof value === 'object' && 'type' in value && value.type === 'group';
}

export function isSDFExpression(value: Value): value is SDFExpression {
  return typeof value === 'object' && 'type' in value && value.type === 'sdf';
}

export class ScopedModuleDeclaration {
  constructor(
    public declaration: ModuleDeclaration,
    public lexicalContext: Context
  ) {}

  call(args: Record<string, Expression>, callContext: Context): SDFExpression {
    // Create new context that inherits from the module's lexical scope
    const moduleContext = this.lexicalContext.child();

    // Track which parameters have been set
    const setParams = new Set<string>();

    // First, assign positional parameters in order
    let posIndex = 0;
    while (args[posIndex.toString()]) {
      if (posIndex >= this.declaration.parameters.length) {
        throw new Error(`Too many positional parameters`);
      }
      const param = this.declaration.parameters[posIndex];
      moduleContext.set(param.name, evalExpression(args[posIndex.toString()], callContext));
      setParams.add(param.name);
      posIndex++;
    }

    // Then handle named parameters
    for (const [key, value] of Object.entries(args)) {
      if (!isNaN(Number(key))) continue; // Skip positional args we already handled

      const param = this.declaration.parameters.find((p) => p.name === key);
      if (!param) {
        throw new Error(`Unknown parameter: ${key}`);
      }
      if (setParams.has(param.name)) {
        throw new Error(`Parameter ${key} was already set positionally`);
      }
      moduleContext.set(param.name, evalExpression(value, callContext));
      setParams.add(param.name);
    }

    // Fill in any remaining parameters with defaults
    for (const param of this.declaration.parameters) {
      if (!setParams.has(param.name)) {
        if (param.defaultValue) {
          moduleContext.set(param.name, evalExpression(param.defaultValue, moduleContext));
        } else {
          throw new Error(`Missing required parameter: ${param.name}`);
        }
      }
    }

    return this.declaration.call(moduleContext);
  }
}

export interface AABB {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}

export interface SDFExpression {
  type: 'sdf';
  expr: string;
  bounds?: AABB;
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

  assign(name: string, value: Value): boolean {
    // Try to find the variable in current scope
    if (this.vars.has(name)) {
      this.vars.set(name, value);
      return true;
    }
    // Try parent scope
    if (this.parent?.assign(name, value)) {
      return true;
    }
    return false;
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
  constructor(public location: SourceLocation) {}
}

export abstract class Statement extends Node {}

export class VariableDeclaration extends Statement {
  constructor(
    public name: string,
    public initializer: Expression,
    location: SourceLocation
  ) {
    super(location);
  }
}

export class AssignmentStatement extends Statement {
  constructor(
    public name: string,
    public value: Expression,
    location: SourceLocation
  ) {
    super(location);
  }
}

export class IfStatement extends Statement {
  constructor(
    public condition: Expression,
    public thenBranch: Statement[],
    public elseBranch: Statement[] | null,
    location: SourceLocation
  ) {
    super(location);
  }
}

export class ForLoop extends Statement {
  constructor(
    public variable: string,
    public range: { start: Expression; end: Expression; step?: Expression },
    public body: Statement[],
    location: SourceLocation
  ) {
    super(location);
  }
}

export class AssertStatement extends Statement {
  constructor(
    public condition: Expression,
    public message: string | undefined,
    location: SourceLocation
  ) {
    super(location);
  }
}

export class ModuleDeclaration extends Statement {
  constructor(
    public name: string,
    public parameters: Parameter[],
    public body: Statement[],
    location: SourceLocation
  ) {
    super(location);
  }

  call(context: Context): SDFExpression {
    return wrapUnion(flattenScope(this.body, context, 'module', this.location));
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
    public children: Statement[],
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
    public operator: '+' | '-' | '*' | '/' | '==' | '!=' | '<' | '<=' | '>' | '>=' | '&&' | '||',
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
    return this.components.map((expr) => {
      const val = evalExpression(expr, context);
      if (typeof val !== 'number') {
        throw new Error('Vector components must evaluate to numbers');
      }
      return val;
    });
  }
}

export class IndexExpression extends Expression {
  constructor(
    public array: Expression,
    public index: Expression,
    location: SourceLocation
  ) {
    super(location);
  }
}

export type NodeType = 
  | 'Number'
  | 'Variable'
  | 'BinaryOp'
  | 'UnaryOp'
  | 'FunctionCall';

export type BinaryOperator = '+' | '-' | '*' | '/';
export type UnaryOperator = '-';

export interface Node {
  type: NodeType;
  evaluate(context: Record<string, number>): number;
}

export interface NumberNode extends Node {
  type: 'Number';
  value: number;
  evaluate(): number;
}

export interface VariableNode extends Node {
  type: 'Variable';
  name: string;
  evaluate(context: Record<string, number>): number;
}

export interface BinaryOpNode extends Node {
  type: 'BinaryOp';
  operator: BinaryOperator;
  left: Node;
  right: Node;
  evaluate(context: Record<string, number>): number;
}

export interface UnaryOpNode extends Node {
  type: 'UnaryOp';
  operator: UnaryOperator;
  operand: Node;
  evaluate(context: Record<string, number>): number;
}

export interface FunctionCallNode extends Node {
  type: 'FunctionCall';
  name: string;
  args: Node[];
  evaluate(context: Record<string, number>): number;
}

// Built-in math functions
const mathFunctions: Record<string, (...args: number[]) => number> = {
  sqrt: Math.sqrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  abs: Math.abs,
};

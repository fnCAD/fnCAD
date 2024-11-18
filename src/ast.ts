import { Interval } from './interval';
import { GLSLContext } from './glslgen';
import { GLSLContext } from './glslgen';

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
  toGLSL(context: GLSLContext): string; 
  evaluateInterval(context: Record<string, Interval>): Interval;
}

export interface NumberNode extends Node {
  type: 'Number';
  value: number;
  evaluate(): number;
  toGLSL(context: GLSLContext): string;
}

export interface VariableNode extends Node {
  type: 'Variable';
  name: string;
  evaluate(context: Record<string, number>): number;
  toGLSL(): string;
}

export interface BinaryOpNode extends Node {
  type: 'BinaryOp';
  operator: BinaryOperator;
  left: Node;
  right: Node;
  evaluate(context: Record<string, number>): number;
  toGLSL(): string;
}

export interface UnaryOpNode extends Node {
  type: 'UnaryOp';
  operator: UnaryOperator;
  operand: Node;
  evaluate(context: Record<string, number>): number;
  toGLSL(): string;
}

export interface FunctionCallNode extends Node {
  type: 'FunctionCall';
  name: string;
  args: Node[];
  evaluate(context: Record<string, number>): number;
  toGLSL(): string;
}


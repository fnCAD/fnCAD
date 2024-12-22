import { Interval } from '../interval';
import { GLSLContext } from './glslgen';

export type NodeType = 
  | 'Number'
  | 'Variable'
  | 'BinaryOp'
  | 'UnaryOp'
  | 'FunctionCall';

export type BinaryOperator = '+' | '-' | '*' | '/';
export type UnaryOperator = '-';

import { Vector3 } from 'three';

export interface Node {
  type: NodeType;
  evaluate(point: Vector3): number;
  toGLSL(context: GLSLContext): string;
  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval;
}

export interface NumberNode extends Node {
  type: 'Number';
  value: number;
}

export interface VariableNode extends Node {
  type: 'Variable';
  name: string;
}

export interface BinaryOpNode extends Node {
  type: 'BinaryOp';
  operator: BinaryOperator;
  left: Node;
  right: Node;
}

export interface UnaryOpNode extends Node {
  type: 'UnaryOp';
  operator: UnaryOperator;
  operand: Node;
}

export interface FunctionCallNode extends Node {
  type: 'FunctionCall';
  name: string;
  args: Node[];
}

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

import { describe, it, expect } from 'vitest';
import { parse } from './parser';
import { RelativeNumberNode } from './evaluator';

describe('RelativeNumberNode', () => {
  it('applies values correctly', () => {
    const halfNode = new RelativeNumberNode(0.5);

    expect(halfNode.applyTo(100)).toBe(50);
  });

  it('parses percent values', () => {
    const ast = parse('50%');
    expect(ast instanceof RelativeNumberNode).toBe(true);
    if (ast instanceof RelativeNumberNode) {
      expect(ast.value).toBe(0.5);
    }
  });

  it('parses ratio values', () => {
    const ast = parse('2.5x');
    expect(ast instanceof RelativeNumberNode).toBe(true);
    if (ast instanceof RelativeNumberNode) {
      expect(ast.value).toBe(2.5);
    }
  });
});

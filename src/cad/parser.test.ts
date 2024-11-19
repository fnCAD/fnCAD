import { describe, it, expect } from 'vitest';
import { parse } from './parser';
import { ModuleCall, ModuleDeclaration } from './types';

describe('OpenSCAD Parser', () => {
  it('parses basic primitives', () => {
    const input = 'cube(1);';
    const ast = parse(input);
    expect(ast.length).toBe(1);
    
    const node = ast[0] as ModuleCall;
    expect(node.type).toBe('ModuleCall');
    expect(node.name).toBe('cube');
    expect(node.arguments['0']).toBeDefined();
    expect(node.arguments['0'].type).toBe('NumberLiteral');
  });

  it('parses module declarations', () => {
    const input = `
      module box(size = 1) {
        cube(size);
      }
    `;
    const ast = parse(input);
    expect(ast.length).toBe(1);
    
    const node = ast[0] as ModuleDeclaration;
    expect(node.type).toBe('ModuleDeclaration');
    expect(node.name).toBe('box');
    expect(node.parameters.length).toBe(1);
    expect(node.parameters[0].name).toBe('size');
    expect(node.parameters[0].defaultValue?.type).toBe('NumberLiteral');
  });

  it('parses transformations with child blocks', () => {
    const input = `
      translate(1, 0, 0) {
        sphere(0.5);
      }
    `;
    const ast = parse(input);
    const node = ast[0] as ModuleCall;
    
    expect(node.type).toBe('ModuleCall');
    expect(node.name).toBe('translate');
    expect(node.children?.length).toBe(1);
    
    const child = node.children?.[0] as ModuleCall;
    expect(child.name).toBe('sphere');
  });

  it('parses boolean operations', () => {
    const input = `
      difference() {
        cube(2);
        translate(0.5, 0.5, 0.5) {
          sphere(1);
        }
      }
    `;
    const ast = parse(input);
    const node = ast[0] as ModuleCall;
    
    expect(node.type).toBe('ModuleCall');
    expect(node.name).toBe('difference');
    expect(node.children?.length).toBe(2);
  });

  it('handles named arguments', () => {
    const input = 'cube(size=2);';
    const ast = parse(input);
    const node = ast[0] as ModuleCall;
    
    expect(node.arguments['size'].type).toBe('NumberLiteral');
  });

  it('preserves source locations', () => {
    const input = 'cube(1);';
    const ast = parse(input);
    const node = ast[0];
    
    expect(node.location).toBeDefined();
    expect(node.location.start.line).toBe(1);
    expect(node.location.start.column).toBe(1);
    expect(node.location.end.line).toBe(1);
    expect(node.location.end.column).toBe(8);
  });
});

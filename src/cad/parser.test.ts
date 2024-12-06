import { describe, it, expect, test } from 'vitest';
import { parse, Parser } from './parser';
import { moduleToSDF } from './builtins';

describe('CAD Parser', () => {
  test('handles invalid single character input', () => {
    expect(() => parse('b')).toThrow();
  });

  test('handles empty input', () => {
    const result = parse('');
    expect(result).toBeDefined();
  });

  test('handles whitespace only input', () => {
    const result = parse('   \n   \t   ');
    expect(result).toBeDefined();
  });

  test('tracks parameter ranges correctly', () => {
    const parser = new Parser('translate(x=1, y=2, 3);');
    parser.parse();
    const calls = parser.getLocations();
    
    expect(calls).toHaveLength(1);
    expect(calls[0].parameters).toHaveLength(3);
    
    // Named parameter should include name
    const param1 = calls[0].parameters[0];
    expect(param1.range.start.offset).toBeLessThan(param1.range.end.offset);
    
    // Positional parameter should just cover value
    const param3 = calls[0].parameters[2];
    expect(param3.range.start.offset).toBeLessThan(param3.range.end.offset);
  });

  test('tracks parameter ranges on long parameters', () => {
    const parser = new Parser('foo(1.0000, 2.0000);');
    parser.parse();
    const calls = parser.getLocations();
    
    expect(calls).toHaveLength(1);
    expect(calls[0].parameters).toHaveLength(2);
    
    // Check first parameter range
    const param1 = calls[0].parameters[0];
    expect(param1.range.start.offset).toBe(4);  // After 'foo('
    expect(param1.range.end.offset).toBe(4 + 6);   // Length of '1.0000'
    
    // Check second parameter range
    const param2 = calls[0].parameters[1];
    expect(param2.range.start.offset).toBe(12); // After ', '
    expect(param2.range.end.offset).toBe(12 + 6);   // Length of '2.0000'
  });

  test('tracks parameters on call with block', () => {
    const parser = new Parser('foo(bar) { baz(); }');
    parser.parse();
    const calls = parser.getLocations();
    
    expect(calls).toHaveLength(2); // foo and baz
    
    // Check inner call (baz)
    expect(calls[0].parameters).toHaveLength(0);
    expect(calls[0].paramRange.start.offset).toBe(15);
    expect(calls[0].paramRange.end.offset).toBe(15);

    // Check outer call (foo) 
    expect(calls[1].parameters).toHaveLength(1);
    expect(calls[1].paramRange.start.offset).toBe(4);
    expect(calls[1].paramRange.end.offset).toBe(7);
    
    const param = calls[1].parameters[0];
    expect(param.range.start.offset).toBe(4);
    expect(param.range.end.offset).toBe(7);
  });
});

describe('OpenSCAD-like Syntax', () => {
  function compileToSDF(input: string): string {
    const ast = parse(input);
    return moduleToSDF(ast);
  }

  it('compiles basic primitives', () => {
    expect(compileToSDF('cube(1);'))
      .toBe('max(max(abs(x) - 0.5, abs(y) - 0.5), abs(z) - 0.5)');
    
    expect(compileToSDF('sphere(1);'))
      .toBe('sqrt(x*x + y*y + z*z) - 1');
  });

  it('compiles transformations', () => {
    expect(compileToSDF('translate(1, 0, 0) { sphere(1); }'))
      .toBe('translate(1, 0, 0, sqrt(x*x + y*y + z*z) - 1)');
    
    expect(compileToSDF('rotate(0, 1.57, 0) { cube(1); }'))
      .toBe('rotate(0, 1.57, 0, max(max(abs(x) - 0.5, abs(y) - 0.5), abs(z) - 0.5))');
  });

  it('compiles boolean operations', () => {
    expect(compileToSDF('union() { sphere(1); cube(1); }'))
      .toBe('min(sqrt(x*x + y*y + z*z) - 1, max(max(abs(x) - 0.5, abs(y) - 0.5), abs(z) - 0.5))');
    
    expect(compileToSDF('difference() { cube(2); sphere(1); }'))
      .toBe('max(max(max(abs(x) - 1, abs(y) - 1), abs(z) - 1), -(sqrt(x*x + y*y + z*z) - 1))');
  });

  it('handles nested transformations', () => {
    const result = compileToSDF(`
      translate(1, 0, 0) {
        rotate(0, 1.57, 0) {
          cube(1);
        }
      }
    `);
    expect(result).toBe(
      'translate(1, 0, 0, rotate(0, 1.57, 0, max(max(abs(x) - 0.5, abs(y) - 0.5), abs(z) - 0.5)))'
    );
  });

  it('handles complex boolean operations', () => {
    const result = compileToSDF(`
      difference() {
        cube(2);
        translate(0.5, 0.5, 0.5) {
          sphere(1);
        }
      }
    `);
    expect(result).toBe(
      'max(max(max(abs(x) - 1, abs(y) - 1), abs(z) - 1), ' +
      '-(translate(0.5, 0.5, 0.5, sqrt(x*x + y*y + z*z) - 1)))'
    );
  });
});

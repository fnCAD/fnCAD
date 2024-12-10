import { describe, it, expect, test } from 'vitest';
import { parse, Parser } from './parser';
import { ParseError } from './errors';
import { moduleToSDF } from './builtins';

describe('CAD Parser', () => {
  test('handles invalid single character input', () => {
    expect(() => parse('b')).toThrow(ParseError);
  });

  test('handles empty input', () => {
    const result = parse('');
    expect(result).toBeDefined();
  });

  test('handles negative number literals', () => {
    const result = parse('-1;');
    expect(result).toBeDefined();
    
    // Should work in expressions
    expect(() => parse('translate([-1, -2, -3]) sphere(1);')).not.toThrow();
    
    // Should work with decimals
    expect(() => parse('-1.5;')).not.toThrow();
  });

  test('handles whitespace only input', () => {
    const result = parse('   \n   \t   ');
    expect(result).toBeDefined();
  });

  test('tracks parameter ranges correctly', () => {
    const parser = new Parser('foo(bar=baz, qux);');
    parser.parse();
    const calls = parser.getLocations();
    
    expect(calls).toHaveLength(1);
    expect(calls[0].parameters).toHaveLength(2);
    
    // Named parameter should include name and value
    const param1 = calls[0].parameters[0];
    expect(param1.name).toBe('bar');
    expect(param1.range.start.offset).toBeLessThan(param1.range.end.offset);
    
    // Positional parameter should just cover value
    const param2 = calls[0].parameters[1];
    expect(param2.name).toBe('1');  // Positional params use index as name
    expect(param2.range.start.offset).toBeLessThan(param2.range.end.offset);
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
    
    // Check outer call (foo) 
    expect(calls[0].parameters).toHaveLength(1);
    expect(calls[0].paramRange.start.offset).toBe(4);
    expect(calls[0].paramRange.end.offset).toBe(7);
    const param = calls[0].parameters[0];
    expect(param.range.start.offset).toBe(4);
    expect(param.range.end.offset).toBe(7);

    // Check inner call (baz)
    expect(calls[1].parameters).toHaveLength(0);
    expect(calls[1].paramRange.start.offset).toBe(15);
    expect(calls[1].paramRange.end.offset).toBe(15);
    
  });

  describe('Parameter Help During Incomplete Syntax', () => {
    test('tracks parameters in incomplete call', () => {
      const parser = new Parser('cube([1, 2, 3], [1 +');
      expect(() => parser.parse()).toThrow(ParseError);
      const calls = parser.getLocations();
      
      expect(calls).toHaveLength(1);
      expect(calls[0].moduleName).toBe('cube');
      expect(calls[0].parameters).toHaveLength(2);
      
      // First parameter should be complete
      const param1 = calls[0].parameters[0];
      expect(param1.value).toBe('[1, 2, 3]');
      
      // Second parameter should be incomplete but tracked
      const param2 = calls[0].parameters[1];
      expect(param2.value).toBeUndefined();
      expect(param2.range.start.offset).toBe(16);
      expect(param2.range.end.offset).toBe(20);
    });

    test('tracks nested calls with incomplete syntax', () => {
      const parser = new Parser('group() { sphere(1);\n cube([1, 2, 3], [1 + \n sphere(2); }');
      expect(() => parser.parse()).toThrow(ParseError);
      const calls = parser.getLocations();
      
      // Should find all calls even with broken syntax
      expect(calls.some(c => c.moduleName === 'group')).toBe(true);
      expect(calls.some(c => c.moduleName === 'sphere')).toBe(true);
      expect(calls.some(c => c.moduleName === 'cube')).toBe(true);
      
      // Find the incomplete cube call
      const cubeCall = calls.find(c => c.moduleName === 'cube');
      expect(cubeCall).toBeDefined();
      expect(cubeCall?.parameters).toHaveLength(2);
      expect(cubeCall?.parameters[1].value).toBeUndefined();
      expect(cubeCall?.parameters[1].range.start.offset).toBe(38);
      expect(cubeCall?.parameters[1].range.end.offset).toBe(43);
    });

    test('tracks parameter ranges in broken syntax', () => {
      const parser = new Parser('translate([1, 2, 3])\n sphere(1, true');
      expect(() => parser.parse()).toThrow(ParseError);
      const calls = parser.getLocations();
      
      expect(calls).toHaveLength(2);
      
      // Check translate call
      const translateCall = calls.find(c => c.moduleName === 'translate');
      expect(translateCall).toBeDefined();
      expect(translateCall?.parameters).toHaveLength(1);
      
      // Check sphere call
      const sphereCall = calls.find(c => c.moduleName === 'sphere');
      expect(sphereCall).toBeDefined();
      expect(sphereCall?.parameters).toHaveLength(2);
      expect(sphereCall?.parameters[1].value).toBe('true');
    });
  });
});

describe('OpenSCAD-like Syntax', () => {
  function compileToSDF(input: string): string {
    const ast = parse(input);
    return moduleToSDF(ast);
  }

  it('handles module definitions', () => {
    const result = parse(`
      module roundedCube(size, r) {
        smooth_union(r) {
          cube(size);
          translate([size/2, size/2, size/2])
            sphere(r);
        }
      }
      
      roundedCube(2, 0.2);
    `);
    expect(result).toBeDefined();
  });

  it('compiles module instances', () => {
    const sdf = compileToSDF(`
      module hole() {
        translate([0, 0, 1])
          cylinder(0.5, 2);
      }
      
      difference() {
        cube(2);
        hole();
      }
    `);
    expect(sdf).toContain('max('); // Should use difference()
    expect(sdf).toContain('translate(0, 0, 1,'); // Should contain the translated cylinder
  });

  it('compiles basic primitives', () => {
    expect(compileToSDF('cube(1);'))
      .toBe('max(max(abs(x) - 0.5, abs(y) - 0.5), abs(z) - 0.5)');
    
    expect(compileToSDF('sphere(1);'))
      .toBe('sqrt(x*x + y*y + z*z) - 1');
  });

  it('handles number literals in blocks', () => {
    expect(() => compileToSDF('union() { 42; }'))
      .toThrow('Expected SDF expression in block');
  });

  it('compiles transformations', () => {
    expect(compileToSDF('translate([1, 0, 0]) sphere(1);'))
      .toBe('translate(1, 0, 0, sqrt(x*x + y*y + z*z) - 1)');
    
    expect(compileToSDF('rotate([0, 1.57, 0]) { cube(1); }'))
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
      translate([1, 0, 0])
        rotate([0, 1.57, 0])
          cube(1);
    `);
    expect(result).toBe(
      'translate(1, 0, 0, rotate(0, 1.57, 0, max(max(abs(x) - 0.5, abs(y) - 0.5), abs(z) - 0.5)))'
    );
  });

  it('handles complex boolean operations', () => {
    const result = compileToSDF(`
      difference() {
        cube(2);
        translate([0.5, 0.5, 0.5])
          sphere(1);
      }
    `);
    expect(result).toBe(
      'max(max(max(abs(x) - 1, abs(y) - 1), abs(z) - 1), ' +
      '-(translate(0.5, 0.5, 0.5, sqrt(x*x + y*y + z*z) - 1)))'
    );
  });
});

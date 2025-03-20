import { describe, it, expect, test, vi, beforeEach, afterEach, SpyInstance } from 'vitest';
import { parse, Parser } from './parser';
import { AABB, Context, ModuleDeclaration, SDFExpression } from './types';
import { evalCAD, moduleToSDF, flattenScope, wrapUnion } from './builtins';
import { ParseError } from './errors';

describe('CAD Parser', () => {
  test('handles invalid single character input', () => {
    expect(() => parse('b')).toThrow(ParseError);
  });

  test('handles empty input', () => {
    const result = parse('');
    expect(result).toBeDefined();
  });

  test('handles variable declarations', () => {
    const result = parse('var x = 42;');
    expect(result).toBeDefined();

    // Test variable usage
    expect(() => parse('var r = 5; sphere(r);')).not.toThrow();

    // Test variable scoping
    const ctx = new Context();
    parse('var size = 10; cube(size);').map((a) => evalCAD(a, ctx));
    expect(ctx.get('size')).toBe(10);
  });

  test('handles negative number literals', () => {
    const result = parse('-1;');
    expect(result).toBeDefined();

    // Should work in expressions
    expect(() => parse('translate([-1, -2, -3]) sphere(1);')).not.toThrow();

    // Should work with decimals
    expect(() => parse('-1.5;')).not.toThrow();
  });

  test('handles negative expressions and variables', () => {
    // This should work, not throw an error
    expect(() => parse('var t = 0; sphere(-t);')).not.toThrow();

    // Test variable negation with evaluation
    const ctx = new Context();
    parse('var t = 5; var r = -t;').map((stmt) => evalCAD(stmt, ctx));
    expect(ctx.get('r')).toBe(-5);

    // Test with function calls and operations
    expect(() => parse('sphere(-radius);')).not.toThrow();
    expect(() => parse('translate([0, -y, 0]) sphere(1);')).not.toThrow();
  });

  test('handles vectors of different sizes', () => {
    // Should allow 2D vector
    expect(() => parse('foo([1, 2]);')).not.toThrow();

    // Should allow 3D vector
    expect(() => parse('foo([1, 2, 3]);')).not.toThrow();

    // Should allow 4D vector
    expect(() => parse('foo([1, 2, 3, 4]);')).not.toThrow();

    // But transform operations should still require 3D
    expect(() => moduleToSDF(parse('translate([1, 2]) sphere(1);'))).toThrow(ParseError);
    expect(() => moduleToSDF(parse('rotate([1, 2, 3, 4]) sphere(1);'))).toThrow(ParseError);
  });

  test('handles boolean operators', () => {
    // Basic boolean operations
    expect(() => parse('if (1 && 0) {}')).not.toThrow();
    expect(() => parse('if (1 || 0) {}')).not.toThrow();

    // Comparison operators
    expect(() => parse('if (x == 1) {}')).not.toThrow();
    expect(() => parse('if (x != 0) {}')).not.toThrow();
    expect(() => parse('if (x <= 5) {}')).not.toThrow();
    expect(() => parse('if (x >= 2) {}')).not.toThrow();

    // Short-circuit evaluation
    const ctx = new Context();
    parse('var x = 1 && 2;').map((stmt) => evalCAD(stmt, ctx));
    expect(ctx.get('x')).toBe(1);

    parse('var y = 0 || 3;').map((stmt) => evalCAD(stmt, ctx));
    expect(ctx.get('y')).toBe(1);

    // Operator precedence
    parse('var z = 1 && 0 || 1;').map((stmt) => evalCAD(stmt, ctx));
    expect(ctx.get('z')).toBe(1);
  });

  test('handles array indexing', () => {
    // Basic indexing
    expect(() => parse('v[0];')).not.toThrow();

    // Nested indexing
    expect(() => parse('v[i[0]];')).not.toThrow();

    // Expression as index
    expect(() => parse('v[1 + 2];')).not.toThrow();

    // Invalid index
    expect(() => moduleToSDF(parse('translate(v[-1]) sphere(1);'))).toThrow(ParseError);
    expect(() => moduleToSDF(parse('translate(v[1.5]) sphere(1);'))).toThrow(ParseError);
    expect(() => moduleToSDF(parse('translate(v["x"]) sphere(1);'))).toThrow(ParseError);
  });

  test('handles positional parameters', () => {
    // Simple positional parameter
    expect(() => parse('foo(42);')).not.toThrow();

    // Mix of positional and named parameters
    expect(() => parse('foo(42, b=3);')).not.toThrow();

    // Multiple positional parameters
    expect(() => parse('foo(1, 2, 3);')).not.toThrow();

    // Test actual evaluation
    const result = parse('sphere(1);');
    expect(result).toBeDefined();
    expect(() => moduleToSDF(result)).not.toThrow();
  });

  test('handles variable assignment', () => {
    const ctx = new Context();
    parse('var x = 5;').map((stmt) => evalCAD(stmt, ctx));
    expect(ctx.get('x')).toBe(5);

    // Test reassignment
    parse('x = 10;').map((stmt) => evalCAD(stmt, ctx));
    expect(ctx.get('x')).toBe(10);

    // Test using assigned value
    parse('var y = x + 5;').map((stmt) => evalCAD(stmt, ctx));
    expect(ctx.get('y')).toBe(15);

    // Test assignment to undefined variable
    expect(() => parse('z = 1;').map((stmt) => evalCAD(stmt, ctx))).toThrow(
      'Undefined variable: z'
    );
  });

  describe('if statements', () => {
    let ctx: Context;

    beforeEach(() => {
      ctx = new Context();
    });

    test('executes then branch when condition is true', () => {
      parse(`
        var taken = 0;
        var x = 1;
        if (x) {
          taken = 1;
        } else {
          taken = 2;
        }
      `).map((stmt) => evalCAD(stmt, ctx));
      expect(ctx.get('taken')).toBe(1);
    });

    test('executes else branch when condition is false', () => {
      parse(`
        var taken = 0;
        var x = 0;
        if (x) {
          taken = 1;
        } else {
          taken = 2;
        }
      `).map((stmt) => evalCAD(stmt, ctx));
      expect(ctx.get('taken')).toBe(2);
    });

    test('handles nested if statements with correct branch execution', () => {
      parse(`
        var result = 0;
        var x = 1;
        var y = 1;
        if (x) {
          result = 1;
          if (y) {
            result = 2;
          } else {
            result = 3;
          }
        } else {
          result = 4;
        }
      `).map((stmt) => evalCAD(stmt, ctx));
      expect(ctx.get('result')).toBe(2);

      // Test nested else branch
      parse(`
        var result = 0;
        var x = 1;
        var y = 0;
        if (x) {
          result = 1;
          if (y) {
            result = 2;
          } else {
            result = 3;
          }
        } else {
          result = 4;
        }
      `).map((stmt) => evalCAD(stmt, ctx));
      expect(ctx.get('result')).toBe(3);
    });

    test('handles comparison operators in conditions', () => {
      parse(`
        var result = 0;
        var x = 5;
        if (x > 3) {
          result = 1;
        }
        if (x <= 5) {
          result = result + 2;
        }
      `).map((stmt) => evalCAD(stmt, ctx));
      expect(ctx.get('result')).toBe(3);
    });
  });

  test('handles basic for loops', () => {
    const ctx = new Context();
    parse(`
      var sum = 0;
      for(var i = [1:3]) {
        sum = sum + i;
      }
      sum;
    `).map((stmt) => evalCAD(stmt, ctx));
    expect(ctx.get('sum')).toBe(6); // 1 + 2 + 3
  });

  test('handles for loops with step', () => {
    const ctx = new Context();
    parse(`
      var sum = 0;
      for(var i = [1:2:9]) {
        sum = sum + i;
      }
      sum;
    `).map((stmt) => evalCAD(stmt, ctx));
    expect(ctx.get('sum')).toBe(25); // 1 + 3 + 5 + 7 + 9

    // Test negative step
    const ctx2 = new Context();
    parse(`
      var sum = 0;
      for(var i = [10:-2:0]) {
        sum = sum + i;
      }
      sum;
    `).map((stmt) => evalCAD(stmt, ctx2));
    expect(ctx2.get('sum')).toBe(30); // 10 + 8 + 6 + 4 + 2 + 0
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
    expect(param2.name).toBe('1'); // Positional params use index as name
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
    expect(param1.range.start.offset).toBe(4); // After 'foo('
    expect(param1.range.end.offset).toBe(4 + 6); // Length of '1.0000'

    // Check second parameter range
    const param2 = calls[0].parameters[1];
    expect(param2.range.start.offset).toBe(12); // After ', '
    expect(param2.range.end.offset).toBe(12 + 6); // Length of '2.0000'
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
      expect(calls.some((c) => c.moduleName === 'group')).toBe(true);
      expect(calls.some((c) => c.moduleName === 'sphere')).toBe(true);
      expect(calls.some((c) => c.moduleName === 'cube')).toBe(true);

      // Find the incomplete cube call
      const cubeCall = calls.find((c) => c.moduleName === 'cube');
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
      const translateCall = calls.find((c) => c.moduleName === 'translate');
      expect(translateCall).toBeDefined();
      expect(translateCall?.parameters).toHaveLength(1);

      // Check sphere call
      const sphereCall = calls.find((c) => c.moduleName === 'sphere');
      expect(sphereCall).toBeDefined();
      expect(sphereCall?.parameters).toHaveLength(2);
      expect(sphereCall?.parameters[1].value).toBe('true');
    });
  });
});

describe('OpenSCAD-like Syntax', () => {
  function compileToSDF(input: string): string {
    const ast = parse(input);
    return moduleToSDF(ast).expr;
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

  describe('module parameter binding', () => {
    let mockCall: SpyInstance<[Context], SDFExpression>;

    beforeEach(() => {
      mockCall = vi.spyOn(ModuleDeclaration.prototype, 'call') as SpyInstance<
        [Context],
        SDFExpression
      >;
    });

    afterEach(() => {
      mockCall.mockRestore();
    });

    it('binds positional parameters in order', () => {
      moduleToSDF(
        parse(`
        module test(x, y) { }
        test(1, 2);
      `)
      );

      const context = mockCall.mock.calls[0][0] as Context;
      expect(context.get('x')).toBe(1);
      expect(context.get('y')).toBe(2);
    });

    it('binds named parameters', () => {
      moduleToSDF(
        parse(`
        module test(x, y) { }
        test(x=1, y=2);
      `)
      );

      const context = mockCall.mock.calls[0][0] as Context;
      expect(context.get('x')).toBe(1);
      expect(context.get('y')).toBe(2);
    });

    it('binds named parameters out of order', () => {
      moduleToSDF(
        parse(`
        module test(x, y) { }
        test(y=2, x=1);
      `)
      );

      const context = mockCall.mock.calls[0][0] as Context;
      expect(context.get('x')).toBe(1);
      expect(context.get('y')).toBe(2);
    });

    it('binds mix of positional and named parameters', () => {
      moduleToSDF(
        parse(`
        module test(x, y, z) { }
        test(1, z=3, y=2);
      `)
      );

      const context = mockCall.mock.calls[0][0] as Context;
      expect(context.get('x')).toBe(1);
      expect(context.get('y')).toBe(2);
      expect(context.get('z')).toBe(3);
    });

    it('uses default values for unspecified parameters', () => {
      moduleToSDF(
        parse(`
        module test(x=10, y=20) { }
        test(y=2);
      `)
      );

      const context = mockCall.mock.calls[0][0] as Context;
      expect(context.get('x')).toBe(10);
      expect(context.get('y')).toBe(2);
    });

    it('errors on unknown parameters', () => {
      expect(() =>
        moduleToSDF(
          parse(`
        module test(x) { }
        test(y=1);
      `)
        )
      ).toThrow('Unknown parameter: y');
    });

    it('errors on double assignment', () => {
      expect(() =>
        moduleToSDF(
          parse(`
        module test(x, y) { }
        test(1, x=2);
      `)
        )
      ).toThrow('Parameter x was already set positionally');
    });

    it('errors on missing required parameters', () => {
      expect(() =>
        moduleToSDF(
          parse(`
        module test(x, y) { }
        test(x=1);
      `)
        )
      ).toThrow('Missing required parameter: y');
    });
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
    expect(compileToSDF('cube(1);')).toBe(
      'max(max(face(abs(x) - 0.5, 0.25), face(abs(y) - 0.5, 0.25)), face(abs(z) - 0.5, 0.25))'
    );

    expect(compileToSDF('sphere(1);')).toBe('face(sqrt(x*x + y*y + z*z) - 1, 0.25)');

    expect(compileToSDF('cone(1, 2);')).toBe(
      `max(
          face(
            1 * (sqrt(x*x + z*z) - 1 * (1 + y)/2),
            0.25
          ),
          face(abs(y) - 1, 0.5)
        )`
    );
  });

  it('handles number literals in blocks', () => {
    expect(() => compileToSDF('union() { 42; }')).toThrow('union requires SDF children');
  });

  it('compiles transformations', () => {
    expect(compileToSDF('translate([1, 0, 0]) sphere(1);')).toBe(
      'translate(1, 0, 0, face(sqrt(x*x + y*y + z*z) - 1, 0.25))'
    );

    expect(compileToSDF('rotate([0, 90, 0]) { cube(1); }')).toBe(
      'rotate(0, 1.5707963267948966, 0, max(max(face(abs(x) - 0.5, 0.25), face(abs(y) - 0.5, 0.25)), face(abs(z) - 0.5, 0.25)))'
    );
  });

  it('compiles boolean operations', () => {
    expect(compileToSDF('union() { sphere(1); cube(1); }')).toBe(
      'aabb(-1, -1, -1, 1, 1, 1, min(face(sqrt(x*x + y*y + z*z) - 1, 0.25), max(max(face(abs(x) - 0.5, 0.25), face(abs(y) - 0.5, 0.25)), face(abs(z) - 0.5, 0.25))))'
    );

    expect(compileToSDF('difference() { cube(2); sphere(1); }')).toBe(
      'aabb(-1, -1, -1, 1, 1, 1, max(max(max(face(abs(x) - 1, 0.5), face(abs(y) - 1, 0.5)), face(abs(z) - 1, 0.5)), -(face(sqrt(x*x + y*y + z*z) - 1, 0.25))))'
    );
  });

  it('handles nested transformations', () => {
    const result = compileToSDF(`
      translate([1, 0, 0])
        rotate([0, 1.57, 0])
          cube(1);
    `);
    expect(result).toBe(
      'translate(1, 0, 0, rotate(0, 0.027401669256310976, 0, max(max(face(abs(x) - 0.5, 0.25), face(abs(y) - 0.5, 0.25)), face(abs(z) - 0.5, 0.25))))'
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
      'aabb(-1, -1, -1, 1, 1, 1, max(max(max(face(abs(x) - 1, 0.5), face(abs(y) - 1, 0.5)), face(abs(z) - 1, 0.5)), ' +
        '-(translate(0.5, 0.5, 0.5, face(sqrt(x*x + y*y + z*z) - 1, 0.25)))))'
    );
  });
});

describe('AABB Bounds Calculation', () => {
  function getBounds(code: string): AABB | undefined {
    const ast = parse(code);
    const nodes = flattenScope(ast, new Context(), 'test', {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
      source: code,
    });
    return wrapUnion(nodes).bounds;
  }

  it('calculates primitive bounds', () => {
    const sphereBounds = getBounds('sphere(1);');
    expect(sphereBounds).toEqual({
      min: [-1, -1, -1],
      max: [1, 1, 1],
    });

    const cubeBounds = getBounds('cube(2);');
    expect(cubeBounds).toEqual({
      min: [-1, -1, -1],
      max: [1, 1, 1],
    });
  });

  it('calculates union bounds', () => {
    const bounds = getBounds(`
      union() {
        translate([2, 0, 0]) sphere(1);
        translate([-2, 0, 0]) sphere(1);
      }
    `);
    expect(bounds).toEqual({
      min: [-3, -1, -1],
      max: [3, 1, 1],
    });
  });

  it('calculates intersection bounds', () => {
    const bounds = getBounds(`
      intersection() {
        translate([0.5, 0, 0]) cube(2);
        translate([-0.5, 0, 0]) cube(2);
      }
    `);
    expect(bounds).toEqual({
      min: [-0.5, -1, -1],
      max: [0.5, 1, 1],
    });
  });

  it('calculates smooth_union bounds with radius', () => {
    const bounds = getBounds(`
      smooth_union(0.5) {
        sphere(1);
        translate([2, 0, 0]) sphere(1);
      }
    `);
    expect(bounds).toEqual({
      min: [-1.5, -1.5, -1.5],
      max: [3.5, 1.5, 1.5],
    });
  });

  it('calculates transformed bounds', () => {
    const bounds = getBounds('translate([1, 2, 3]) cube(2);');
    expect(bounds).toEqual({
      min: [0, 1, 2],
      max: [2, 3, 4],
    });

    const scaledBounds = getBounds('scale([2, 1, 0.5]) cube(2);');
    expect(scaledBounds).toEqual({
      min: [-2, -1, -0.5],
      max: [2, 1, 0.5],
    });
  });

  it('handles undefined bounds gracefully', () => {
    // Create a module that doesn't specify bounds
    const bounds = getBounds(`
      module test() { 
        // Return empty union to ensure no bounds
        union() {}
      }
      test();
    `);
    expect(bounds).toBeUndefined();
  });
});

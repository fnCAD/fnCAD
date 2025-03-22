# OpenSCAD Compatibility Roadmap

## Core Language Features

### Differences from OpenSCAD
- `var a = 3;` explicitly defines a scoped variable `a`.
- `a = 5;` reassigns `a` *even for future scopes* by overwriting the *existing* binding. (Like in every other language!)
- `module foo()` can return values, obviating functions.
- All loop/group operators return *grouped* SDFs, which are *expanded* in the caller.
   This removes the need for `intersection_for`.

### Modules and Functions
- [x] Basic module calls with parameters
- [x] Module blocks with children
- [x] Named parameters on call
- [x] Default parameter values
- [x] Module definitions
- [ ] Echo statements for debugging
- [ ] Assert statements
- [x] Module instantiation (use)

### Control Flow
- [x] For loops
- [x] If/else conditionals
- [ ] Conditional operator (?:)

### Variables and Expressions
- [x] Basic arithmetic (+, -, *, /)
- [x] Vector literals `[x, y, z]`
- [x] List index `a[2]`
- [x] Variable declarations
- [x] For loops with range `for(var i = [1:10])`
- [ ] List comprehensions
- [x] Ranges with step `[start:step:end]`
- [/] String literals and concatenation
- [x] Boolean operations (&&, ||, !)
- [x] Comparison operators (<, >, ==, etc)

## Transformations

### Basic Transforms
- [x] translate([x,y,z])
- [x] rotate([x,y,z])
- [x] scale([x,y,z])
- [ ] mirror([x,y,z])
- [ ] multmatrix(m)
- [ ] color("color", alpha)

### OpenSCAD Advanced Transforms
- We need our own story for this functionality, they're inextricable from OpenSCAD's mesh approach.
- [/] offset(r|delta, chamfer)
- [/] minkowski() - Functionality handled by `smooth_*`
- [/] hull()
- [/] projection(cut = true/false)
- [/] linear_extrude(height, ...)
- [/] rotate_extrude(angle, ...)

### fnCAD Advanced Operations
- [x] smooth_union()
- [x] smooth_difference()
- [x] smooth_intersection() 
- [x] detail
- [ ] `repeated(x=2) {}`

## Primitives

### 2D Primitives
- Omitted from fnCAD - we have no good 2D story because we're volumetric.
- [/] circle(r|d)
- [/] square(size, center)
- [/] polygon(points, paths)
- [/] text(text, size, ...)

### 3D Primitives
- [x] sphere(r|d)
- [x] cube(size, center)
- [x] cylinder(h, r|d, ...)
- [ ] polyhedron(points, faces)

## Boolean Operations

### Basic Operations
- [x] union()
- [x] difference()
- [x] intersection()

## Standard Library
- [x] Math functions (sin, cos, tan, asin, acos, atan, atan2)
- [x] Math utilities (abs, floor, ceil, round, sqrt, pow, log, exp, min, max)
- [ ] List operations
- [ ] String functions
- [ ] Common shapes (regular_polygon, etc)

## Implementation Notes

1. Parser Enhancements Needed:
   - Add support for function definitions
   - Implement control flow parsing
   - Add string and boolean literal support
   - Support for more operators

2. Evaluation Changes:
   - Add scope for function definitions
   - Implement control flow evaluation
   - Add type system for lists/strings

3. SDF Generation:
   - Implement remaining primitives
   - Add support for 2D operations
   - Add extrusion support
   - Implement remaining transforms

4. Standard Library:
   - Port essential OpenSCAD functions
   - Implement common shape helpers
   - Add math function support

## Extensions Beyond OpenSCAD

Current extensions to standard OpenSCAD:
- [x] Smooth boolean operations
- [x] Direct SDF function support
- [x] Live preview with ray marching
- [x] Adaptive mesh generation

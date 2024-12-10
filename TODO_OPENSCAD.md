# OpenSCAD Compatibility Roadmap

## Core Language Features

### Modules and Functions
- [x] Basic module calls with parameters
- [x] Module blocks with children
- [x] Named parameters
- [x] Default parameter values
- [ ] Function definitions
- [ ] Let expressions
- [ ] Echo statements for debugging
- [ ] Assert statements
- [ ] Module instantiation (use)

### Control Flow
- [ ] For loops
- [ ] Intersection_for
- [ ] If/else conditionals
- [ ] Conditional operator (?:)

### Variables and Expressions
- [x] Basic arithmetic (+, -, *, /)
- [x] Vector literals [x, y, z]
- [ ] List comprehensions
- [ ] Range expressions [start:step:end]
- [ ] String literals and concatenation
- [ ] Boolean operations (&&, ||, !)
- [ ] Comparison operators (<, >, ==, etc)

## Transformations

### Basic Transforms
- [x] translate([x,y,z])
- [x] rotate([x,y,z])
- [x] scale([x,y,z])
- [ ] mirror([x,y,z])
- [ ] multmatrix(m)
- [ ] color("color", alpha)

### Advanced Transforms
- [ ] offset(r|delta, chamfer)
- [ ] minkowski()
- [ ] hull()
- [ ] projection(cut = true/false)
- [ ] linear_extrude(height, ...)
- [ ] rotate_extrude(angle, ...)

## Primitives

### 2D Primitives
- [ ] circle(r|d)
- [ ] square(size, center)
- [ ] polygon(points, paths)
- [ ] text(text, size, ...)

### 3D Primitives
- [x] sphere(r|d)
- [x] cube(size, center)
- [x] cylinder(h, r|d, ...)
- [ ] polyhedron(points, faces)

## Boolean Operations

### Basic Operations
- [x] union()
- [x] difference()
- [ ] intersection()

### Advanced Operations
- [x] smooth_union() (Non-standard extension)
- [x] smooth_difference() (Non-standard extension)
- [x] smooth_intersection() (Non-standard extension)

## Special Features
- [ ] import() for STL/DXF/etc
- [ ] surface() for heightmaps
- [ ] render(convexity)
- [ ] children() selector
- [ ] $fn, $fa, $fs variables
- [ ] Special variables ($t, etc)

## Standard Library
- [ ] Math functions (sin, cos, etc)
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
- [ ] Direct SDF function support
- [ ] Live preview with ray marching
- [ ] Adaptive mesh generation

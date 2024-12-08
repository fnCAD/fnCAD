# OpenSCAD-like Syntax Implementation

## 1. Core Language Features
- [x] Basic primitives that lower to SDFs:
  - [x] cube
  - [x] sphere
  - [x] cylinder
  - [ ] polyhedron
- [x] Boolean operations:
  - [x] union
  - [x] difference
  - [ ] intersection
- [x] Transformations:
  - [x] translate
  - [x] rotate
  - [x] scale
  - [ ] mirror
  - [ ] multmatrix

## 2. Language Improvements
- [ ] First-class functions
- [ ] Let bindings
- [ ] Pattern matching
- [x] Type system
- [x] Modules as proper functions
- [x] Named arguments with defaults
- [x] Better error messages

## 3. Control Flow
- [ ] for loops with proper iteration
- [ ] if/else as expressions
- [ ] list comprehensions
- [ ] map/reduce/filter

## 4. Data Structures
- [ ] Proper lists/arrays
- [ ] Records/structs
- [ ] Optional types
- [ ] Custom types

## 5. SDF Integration
- [x] All primitives implemented as clean SDFs
- [x] Boolean ops preserve SDF properties
- [x] Transformations maintain distance field
- [x] Custom SDF function escape hatch
- [ ] Smooth unions and other SDF-specific operations

## 6. Tooling
- [x] Syntax highlighting (via Monaco)
- [x] Code completion (via Monaco)
- [ ] Documentation generation
- [ ] Import/export system
- [ ] Package management

## 7. OpenSCAD Compatibility
- [ ] Import existing OpenSCAD files
- [ ] Compatibility layer for common idioms
- [ ] Migration guide
- [ ] Common pattern translations

## 8. Advanced Features
- [ ] Named anchors and attachment points
- [ ] Parametric designs
- [ ] Library system
- [ ] Meta-programming capabilities
- [ ] Debug visualization tools

## 9. Infrastructure
- [x] Clean separation between layers:
  - [x] SDF layer: Pure mathematical primitives
  - [x] OpenSCAD layer: CAD operations and modules
  - [x] Bridge layer: Converts between representations
- [x] Testing infrastructure
- [x] Error handling

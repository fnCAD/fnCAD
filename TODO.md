# Implementation Steps

## 1. Basic Setup ✓
- [x] Project structure and build system
- [x] Development server
- [x] Basic UI layout (editor/preview/controls)
- [x] WebGL context setup

## 2. Development Environment ✓
- [x] Setup Vite build system
- [x] Three.js integration
- [x] Code editor (Monaco) integration
- [x] Hot reload setup
- [x] TypeScript configuration

## 3. SDF Core ✓
- [x] AST parser for SDF functions
- [x] Function transpiler with multiple targets:
  - [x] Interval arithmetic evaluator
  - [x] Float number evaluator
  - [x] GLSL shader code generator
- [x] Basic SDF primitives library
- [x] Combining operations (min/max for union)
- [x] Additional combining operations:
  - [x] Smooth union
  - [x] Intersection
  - [x] Difference
  - [x] Smooth intersection
  - [x] Smooth difference

## 4. Ray Marching Preview ✓
- [x] Fragment shader for SDF evaluation
- [x] Basic ray marching implementation
- [x] Camera controls
- [x] Optimized lighting:
  - [x] Depth-based normal approximation
  - [ ] Frame-to-frame normal caching (NICE TO HAVE, NOT URGENT)
  - [x] Basic directional lighting

## 5. Octree Generation ✓
- [x] Interval arithmetic implementation
- [x] Recursive octree subdivision
- [x] SDF boundary detection
- [x] Visualization of octree structure
- [x] Adaptive subdivision based on SDF complexity
- [ ] Objects should be able to set "edge minsize" and "face minsize" separately.
      Cubes must have pretty small edge minsize for instance.

## 6. Initial Mesh Generation ✓
- [x] Octree to mesh conversion
- [x] Surface cell identification
- [x] Vertex placement strategy
- [x] Face generation
- [x] Preview of raw octree mesh

## 7. Mesh Refinement ✓
- [x] SDF gradient calculation
- [x] Vertex optimization
- [x] Surface smoothing
- [x] Error metrics
- [x] Progressive refinement visualization

## 8. Export and UI Polish ✓
- [x] STL export
- [x] Progress indicators
- [x] Error handling
- [x] UI controls for all stages
- [x] Performance settings
- [x] Filename field (applied on save)

## 9. Language Redesign
- [x] Switch to OpenSCAD-like syntax (see TODO_OPENSCAD.md)
- [x] SDF lowering layer for OpenSCAD operations
- [x] Preserve direct SDF function support as escape hatch

## 10. Advanced Features
- [x] Undo/redo
- [x] Localstorage
- [x] Project save/load
- [ ] Material/color support

## 11. Documentation & Examples
- [x] User guide
- [x] OpenSCAD compatibility guide
- [x] SDF function reference
- [x] Example gallery
- [ ] Tutorial content

## 12. Optimizations
- [x] Optimize interval evaluation for AABBs in complex regions
  - Current approach evaluates full SDF
  - Could use geometric bounds/properties instead
  - Balance between accuracy and performance

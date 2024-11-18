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

## 3. SDF Core
- [x] AST parser for SDF functions
- [x] Function transpiler with multiple targets:
  - [x] Interval arithmetic evaluator
  - [x] Float number evaluator
  - [x] GLSL shader code generator
- [x] Basic SDF primitives library
- [x] Combining operations (min/max for union)
- [ ] Additional combining operations:
  - [ ] Smooth union
  - [ ] Intersection
  - [ ] Difference
  - [ ] Smooth intersection
  - [ ] Smooth difference

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

## 8. Export and UI Polish
- [x] STL export
- [ ] Progress indicators
- [x] Error handling
- [x] UI controls for all stages
- [x] Performance settings

## 9. Language Redesign
- [ ] Switch to OpenSCAD-like syntax (see TODO_OPENSCAD.md)
- [ ] SDF lowering layer for OpenSCAD operations
- [ ] Preserve direct SDF function support as escape hatch

## 10. Advanced Features
- [ ] Undo/redo
- [ ] Project save/load
- [ ] Multiple viewport angles
- [ ] Material/color support

## 11. Documentation & Examples
- [ ] User guide
- [ ] OpenSCAD compatibility guide
- [ ] SDF function reference
- [ ] Example gallery
- [ ] Tutorial content

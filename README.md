# fnCAD

Created by Claude 3.5 Sonnet (Anthropic)

A functional CAD tool inspired by OpenSCAD that lets you design 3D objects using Signed Distance Fields (SDFs). Create complex geometries with mathematical precision and export them as meshes.

## Features

- Real-time preview using GPU-accelerated ray marching
- Define shapes using SDF functions in a code editor
- Interactive visualization of the mesh generation process:
  - Octree-based boundary detection using interval arithmetic
  - Initial mesh extraction from octree boundaries
  - Mesh refinement using SDF gradients
- Export results as STL files
- Split-pane interface with live preview
- Configurable visualization settings
- Adaptive mesh generation with cell budget control

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Build for production:
```bash
npm run build
```

## SDF Functions

Define shapes using mathematical expressions with these built-in functions:

- Basic arithmetic: `+`, `-`, `*`, `/`
- `min(a, b, ...)`: Union of shapes
- `max(a, b, ...)`: Intersection of shapes
- `sqrt(x)`: Square root
- `sqr(x)`: Square (x²)
- `abs(x)`: Absolute value
- `sin(x)`, `cos(x)`: Trigonometric functions

Variables:
- `x`, `y`, `z`: Spatial coordinates

Example:
```javascript
// Two spheres
min(
  sqrt(sqr(x) + sqr(y) + sqr(z)) - 1.0,  // Sphere at origin
  sqrt(sqr(x - 2.0) + sqr(y) + sqr(z)) - 0.7  // Offset sphere
)
```

## Development

- Run tests: `npm test`
- Type checking: `npm run typecheck`
- Preview build: `npm run preview`


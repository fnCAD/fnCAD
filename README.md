# fnCAD


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

## License

MIT License

Copyright (c) 2024 FeepingCreature

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

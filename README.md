# WebSDF

A browser-based CAD tool that lets you design 3D objects using Signed Distance Fields (SDFs). Create complex geometries with mathematical precision and export them as meshes.

## Features

- Real-time preview using GPU-accelerated ray marching
- Define shapes using SDF functions in a code editor
- Interactive visualization of the mesh generation process:
  - Octree-based boundary detection using interval arithmetic
  - Initial mesh extraction from octree boundaries
  - Mesh refinement using SDF gradients
- Export results as STL files
- Split-pane interface with live preview

## Getting Started

(Coming soon)

## How It Works

1. **Design**: Write SDF functions to define your 3D object mathematically
2. **Preview**: See immediate results with GPU ray marching
3. **Generate**: Convert your SDF into a high-quality mesh through:
   - Octree decomposition
   - Boundary detection
   - Mesh extraction
   - Surface optimization
4. **Export**: Save your model as STL for 3D printing or other uses

## License

MIT License

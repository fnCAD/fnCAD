# fnCAD

A CAD single-page app: OpenSCAD but with Signed Distance Fields (SDFs). Shader-based realtime preview, octree mesher for
STL export.

Click here to open: https://fncad.github.io/

Intended for 3D printing.

WARNING: This is actually not really as good an idea as I thought and the octree mesher is somewhat slow and janky.
Also the resulting meshes are very far from optimal, but what do you care? You'll just chuck 'em in a slicer anyway.

On the other hand, you get smooth-edged CSG! So it's not all bad.

## Key Features

- **OpenSCAD-like syntax** with familiar modules, transformations, and operations
  - Note: only a fraction of operators is currently implemented, and some syntax is different.
- **Real-time preview** using GPU-accelerated ray marching
- **Octree mesh generation** with adaptive resolution
- **Export to STL** for 3D printing
- **Smooth CSG** for creating organic shapes
- **Save and share** using GitHub Gists and Google Drive, directly via the URL
- **Direct SDF function support** for advanced users

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

## Contributing

Before opening a PR please run:

```bash
npm run test
npm run format
npm run typecheck
```

## Created by AI

Created by Claude 3.5 Sonnet and Claude 3.7 Sonnet (Anthropic).

The great majority of the code in this repository was written by LLMs using [aider](https://github.com/Aider-AI/aider)
as a harness. It's not that I don't understand it - particular the high level design and octree search I'll
happily take credit for, and of course I've *designed* the app in the sense that I've outlined the intent and
features in moderate detail - the actual nuts and bolts of the code are near entirely written by Sonnet.

Also, the UI is entirely Sonnet. I haven't even looked at the CSS.

I say this not to disclaim responsibility, but to emphasize the remarkable level of skill that AI has reached.
I could have written this without AI, but it would have taken maybe five times longer or more, even if I didn't run
out of energy.

So, thanks Sonnet! And ... good job.

## Usage

### Basic Shapes

```
// Basic primitives
sphere(10);
cube([20, 20, 20], center=true);
cylinder(r=5, h=10);

// Positioning and transformations
translate([10, 0, 0])
  sphere(5);

rotate([0, 45, 0])
  cube(10);

scale([1, 2, 1])
  sphere(5);
```

### Boolean Operations

```
// Regular boolean operations
union() {
  sphere(10);
  translate([15, 0, 0])
    sphere(7);
}

difference() {
  cube(20, center=true);
  sphere(12);
}

intersection() {
  cube(20, center=true);
  sphere(15);
}

// Smooth boolean operations for organic shapes
smooth_union(2) {
  sphere(10);
  translate([15, 0, 0])
    sphere(7);
}
```

### Variables and Modules

```
// Variables
var radius = 10;
var height = 20;

// Custom modules
module rounded_cylinder(r, h, corner_radius) {
  smooth_union(corner_radius) {
    cylinder(r=r, h=h-corner_radius*2);
    translate([0, 0, h-corner_radius])
      torus(r1=r, r2=corner_radius);
    translate([0, 0, corner_radius])
      torus(r1=r, r2=corner_radius);
  }
}

// Use the module
rounded_cylinder(radius, height, 2);
```

### Advanced SDF Functions

For advanced users, direct SDF expressions are supported:

```
sdf(sqrt(sqr(x) + sqr(y) + sqr(z)) - 10);
```

## Keyboard Shortcuts

- `Ctrl+5` - Generate standard resolution mesh
- `Ctrl+6` - Generate high resolution mesh
- `Esc` - Return to preview mode
- `Tab` - Indent code
- `Shift+Tab` - Unindent code

## Sharing

Projects can be saved and shared via:
- GitHub Gists (requires GitHub token with gist scope)
- Google Drive (requires authentication)

Files are autosaved to browser local storage.

## License

MIT


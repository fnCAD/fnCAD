# Repository Refactor Plan

## General Architecture Issues

1. **State Management**
   - The AppState class in `src/state.ts` is too large and has too many responsibilities
   - Should be split into smaller, focused classes (DocumentManager, MeshManager, ViewManager)
   - Consider using a more formal state management pattern

2. **Worker Communication**
   - Current worker implementation in `src/worker/mesh-worker.ts` lacks robust error handling
   - Progress reporting is primitive and could be improved
   - No proper cancellation mechanism for long-running operations

3. **Type Safety**
   - Many places use `any` or have implicit type conversions
   - Content type in `src/sdf_expressions/types.ts` could be more strictly typed
   - Better use of discriminated unions would improve type safety

4. **Code Duplication**
   - Multiple implementations of rotation logic across files
   - Interval arithmetic operations duplicated in several places
   - SDF evaluation logic repeated in different contexts

## Specific Files

### src/cad/builtins.ts
- Very large file with too many responsibilities
- Module evaluation and SDF generation should be separated
- AABB calculation logic should be extracted to its own utility

### src/cad/parser.ts
- Complex and difficult to maintain
- Consider using a parser generator library instead of hand-written parser
- Error reporting could be improved with more context

### src/halfedge.ts
- Good overall design but lacks documentation
- Edge splitting logic is complex and could be simplified
- Vertex optimization could be more efficient

### src/interval.ts
- Good implementation but lacks comprehensive tests
- Some operations like sin/cos use naive sampling instead of proper interval arithmetic
- Could benefit from operator overloading (via TypeScript decorators)

### src/meshgen.ts
- Mesh generation algorithm is complex and hard to understand
- Progress reporting is basic and could be improved
- No ability to cancel long-running operations

### src/octree.ts
- Neighbor finding algorithm is complex and could be simplified
- No spatial hashing for large scenes
- Memory usage could be optimized for large models

### src/shader.ts
- GLSL code generation is brittle and hard to maintain
- No shader caching mechanism
- Limited shader customization options

### src/state.ts
- Too many responsibilities in one class
- Document management mixed with 3D view management
- No clear separation between model and view

## Immediate Action Items

1. **Refactor Rotation Logic**
   - Create a common rotation utility used by all components
   - Ensure consistent behavior across all rotation operations

2. **Improve Type Safety**
   - Remove any `any` types and replace with proper types
   - Use discriminated unions for Content type
   - Add more comprehensive type checking

3. **Split AppState**
   - Create DocumentManager for document operations
   - Create MeshManager for mesh generation and optimization
   - Create ViewManager for camera and rendering

4. **Enhance Worker Communication**
   - Implement proper cancellation mechanism
   - Improve progress reporting with phase information
   - Add better error handling and recovery

5. **Optimize Mesh Generation**
   - Implement adaptive subdivision based on surface complexity
   - Add level-of-detail control for preview vs. final mesh
   - Improve memory usage for large models

6. **Improve UI Responsiveness**
   - Move more work to background threads
   - Add debouncing for frequent operations
   - Implement progressive rendering for large models

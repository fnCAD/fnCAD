# Repository Refactor Plan

## General Architecture Issues

1. **State Management**
   - The AppState class in `src/state.ts` has many responsibilities, but previous attempts to split it made the code harder to understand
   - Focus on targeted improvements rather than wholesale restructuring
   - Consider adding clear internal sections with comments rather than splitting into multiple classes

2. **Worker Communication**
   - Current worker implementation in `src/worker/mesh-worker.ts` lacks robust error handling
   - Progress reporting is challenging for heterogeneous octree subdivision
   - No proper cancellation mechanism for long-running operations
   - Priority: Implement task cancellation support

3. **Content Type Improvements**
   - Split functionality in `src/sdf_expressions/types.ts` into separate interfaces:
     - One for interval arithmetic operations
     - One for content categorization
   - Eliminate `return null` cases with proper type handling
   - Use discriminated unions more consistently

4. **Code Duplication**
   - ✓ Rotation logic centralized in RotationUtils
   - Review other potential areas for consolidation

## Specific Files

### src/cad/builtins.ts
- Large file but with a clear purpose ("Module to SDF" conversion)
- AABB calculation logic could be extracted to its own utility
- Add better documentation for the complex parts

### src/halfedge.ts
- Edge splitting logic may be unnecessary - investigate if it can be removed
- Vertex optimization could be improved by having `evaluateContent` provide gradient information directly
- Add documentation for the complex algorithms

### src/interval.ts
- Improve sin/cos implementations with proper interval arithmetic
- Add more comprehensive tests
- TypeScript doesn't support operator overloading via decorators, so current approach is reasonable

### src/meshgen.ts
- Add better documentation for the mesh generation algorithm
- Implement cancellation support
- Improve progress reporting with phase information

### src/octree.ts
- Neighbor finding algorithm is appropriate for the task
- Consider caching unchanged parts of the scene between runs
- Focus on computation optimization rather than memory usage

## Immediate Action Items

1. **✓ Refactor Rotation Logic**
   - Common rotation utility created and integrated

2. **Improve Content Type**
   - Split into separate interfaces for different responsibilities
   - Eliminate null returns with proper type handling
   - Add comprehensive documentation

3. **Enhance Worker Communication**
   - Implement proper cancellation mechanism
   - Add better error handling and recovery
   - Improve progress reporting where feasible

4. **Optimize Mesh Generation**
   - Add documentation to clarify the algorithm
   - Implement cancellation support
   - Consider caching unchanged parts between runs

5. **Improve Vertex Optimization**
   - Modify evaluateContent to provide gradient information
   - Reduce redundant SDF evaluations

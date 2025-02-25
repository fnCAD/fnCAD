# Repository Refactor Plan

## General Architecture Issues

1. **State Management**
   - AI:
      - The AppState class in `src/state.ts` is too large and has too many responsibilities
      - Should be split into smaller, focused classes (DocumentManager, MeshManager, ViewManager)
      - Consider using a more formal state management pattern
   - User:
      - You tried that last time and it just made it a lot harder to understand and modify.
      - Please believe me that the current state.ts is an improvement on what came before.
      - When you change this again, think really hard about whether it makes it
         cleaner or just more distributed.

2. **Worker Communication**
   - Current worker implementation in `src/worker/mesh-worker.ts` lacks robust error handling
   - Progress reporting is primitive and could be improved
      - User: GL figuring out progress reporting for a very heterogenous octree subdivision. I tried.
   - No proper cancellation mechanism for long-running operations

3. **Type Safety**
   - Many places use `any` or have implicit type conversions
      - User: This seems to be a hallucination tbh.
   - Content type in `src/sdf_expressions/types.ts` could be more strictly typed
      - User:
         - I really want to split this into "things that do Interval and things that do Content."
         - Get rid of all the `return null`s.
   - Better use of discriminated unions would improve type safety

4. **Code Duplication**
   - Multiple implementations of rotation logic across files
      - Fixed!
   - Interval arithmetic operations duplicated in several places
      - User: really? Like what?
   - SDF evaluation logic repeated in different contexts
      - User: Same question.

## Specific Files

### src/cad/builtins.ts
- Very large file with too many responsibilities
- Module evaluation and SDF generation should be separated
   - User: Not sure I agree. "Module to SDF" is just what this *does.*
      Feels like inserting a middle-end for no added benefit.
- AABB calculation logic should be extracted to its own utility

### src/cad/parser.ts
- Complex and difficult to maintain
   - User: Eh, really? I like RD. Not in my experience: so far, parser changes haven't really hurt us.
- Consider using a parser generator library instead of hand-written parser
- Error reporting could be improved with more context
   - User: Sure but it's plenty viable for 1.0 imo.

### src/halfedge.ts
- Good overall design but lacks documentation
- Edge splitting logic is complex and could be simplified
   - User: Tbh I'm not sure if edge splitting is needed at all anymore; that was part of a
      "fine subdivision" design that was removed. Check?
- Vertex optimization could be more efficient
   - User: Oh yeah we evaluate four times to get the gradient. Would be better if `evaluateContent` just
      gave us the gradient straight away.

### src/interval.ts
- Good implementation but lacks comprehensive tests
- Some operations like sin/cos use naive sampling instead of proper interval arithmetic
- Could benefit from operator overloading (via TypeScript decorators)
   - User: All my googling tells me that Typescript doesn't have that?

### src/meshgen.ts
- Mesh generation algorithm is complex and hard to understand
- Progress reporting is basic and could be improved
- No ability to cancel long-running operations

### src/octree.ts
- Neighbor finding algorithm is complex and could be simplified
   - User: Really? Seems pretty straightforward to me. I don't see how else you'd do it either.
- No spatial hashing for large scenes
   - User: What would this buy us? We'd need to hash on the SDF component...........
      Hm. Maybe! Interesting! Cache at least unchanged parts of the scene from the last run.
- Memory usage could be optimized for large models
   - User: Hasn't been an issue so far. Computation is the bigger factor by far.

### src/shader.ts
- GLSL code generation is brittle and hard to maintain
   - User: Really?
- No shader caching mechanism
   - User: No need, if you make a codechange the shader ~always changes too.
      Maybe again, cache unchanged parts between runs? But that's super GPU driver dependent.
      Does GLSL let you precompile libraries?
- Limited shader customization options
   - User: So? OpenSCAD only has color.

### src/state.ts
- Too many responsibilities in one class
- Document management mixed with 3D view management
- No clear separation between model and view
   - User: Well at any rate be careful; you're treading on well-trod ground here.

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

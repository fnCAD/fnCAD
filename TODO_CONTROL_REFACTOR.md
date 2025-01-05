# Control Classes Refactor Plan

The control/manager class logic has grown unmaintainable.
The UI which made sense for testing also needs to be rethought.

## 1. Remove Existing Control Systems

### Task Management
- [ ] Remove TaskQueue and all task-related code - in progress!
- [ ] Replace with simple async callback operations (not await, we need explicit state control)
- [ ] Add task cancellation support for octree gen and mesh gen (chunk tasks smaller, see below)

### UI Simplification 
- [ ] Remove all settings panels and overlays
- [ ] Replace with simple keyboard shortcuts:
  - F5: Render and show mesh (like openscad)
  - F6: Render and show mesh at higher default detail
  - Esc: Cancel current operation
- [ ] Low Priority: move visualization settings into CAD language:
  ```
  $minerror = 0.01;
  $minsize = 0.01;
  detailed() {
    // your model here
  }
  ```

### State Management
- [ ] Remove manager classes
- [ ] Code change just triggers GLSL regen, swap to preview mode (fast)
- [ ] Hit F5 again to get mesh view again

### Mesh Data Transfer (low prio)
- [ ] Replace JSON serialization with TypedArrays
- [ ] Use transferable objects for worker communication
- Structure:
  ```typescript
  interface MeshData {
    vertices: Float32Array;  // [x,y,z, x,y,z, ...]
    indices: Uint32Array;   // [i,j,k, i,j,k, ...]
  }
  ```

### Worker Communication
- Single worker instance
- Clear cancellation protocol
- If we mesh in the worker, we only need to send the mesh back.
  - Meaning the octree becomes a pure worker implementation detail.
- No progress updates, just chunk the tasks smaller (keep state in `self`)
  - Ie. for octree, two commands: 1. "do enough steps to have 100 leaves" 2. "do each leaf"
  - main thread just sends "do the next task".
  - How does this work? Task queue.
    Push the big 65536 block.
    While queue length < 100, pop the top task, eval, maybe push new tasks if they're EDGE or FACE.
    Send to main "I have 100 tasks pending."
      Main says: "Okay, do task."
      Thread pops top task, evaluates it completely (different function!), sends back "I have done task 1 of 100."
      Main updates progbar.
    Repeat until queue is empty.

## 3. New Architecture

### Core Components
1. Editor
   - CodeMirror instance
   - Parse/validate on change
   - Trigger switch to preview, preview (GLSL) updates

2. Preview
   - WebGL context
   - Raymarching shader only does raymarching
   - Existing camera controls

3. Mesh view
   - WebGL, immediate mode (drop from the preview shader, there's no need to have both)
   - THREE.js mesh display
   - Same camera view

3. Mesh Generator
   - Single cancelable task
   - Progress feedback
   - TypedArray transfer

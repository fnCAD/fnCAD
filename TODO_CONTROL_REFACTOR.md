# Control Classes Refactor Plan

The control/manager class logic has grown unmaintainable.
The UI which made sense for testing also needs to be rethought.

## 1. Remove Existing Control Systems

### Task Management
- [x] Remove TaskQueue and all task-related code.
- [x] Replace with simple async callback operations (not await, we need explicit state control)
- [ ] Add task cancellation support for octree gen and mesh gen (chunk tasks smaller, see below)

### UI Simplification 
- [x] Remove all settings panels and overlays
- [x] Replace with simple keyboard shortcuts:
  - Ctrl+5: Render and show mesh (like openscad)
  - Ctrl+6: Render and show mesh at higher default detail
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
- [x] Remove manager classes
- [x] Code change just triggers GLSL regen, swap to preview mode (fast)
- [x] Hit F5 again to get mesh view again

### Next Steps
1. Implement mesh generation in AppState
2. Add task cancellation support
3. Implement TypedArray mesh transfer

### Worker Communication
- [ ] Single worker instance for mesh generation
- [ ] Clear cancellation protocol
- [ ] Chunked task processing:
  1. Initial octree subdivision to N leaves
  2. Process leaves in small batches
  3. Progress updates per batch

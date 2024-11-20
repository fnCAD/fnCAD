# Background Task Implementation Plan

## Affected Files

### Core Implementation Files
- src/workers/worker.ts (new) - Worker thread implementation
- src/workers/messages.ts (new) - Worker message types
- src/workers/tasks.ts - Task queue implementation
- src/octree.ts - Add parallel subdivision support
- src/meshgen.ts - Add progress reporting to mesh generation

### State Management
- src/managers/state.ts - Add task queue and progress tracking
- src/managers/renderer.ts - Add progress bar UI
- src/managers/octree.ts - Update octree generation flow

### UI Components
- src/style.css - Add progress bar styles
- index.html - Add progress bar container
- src/main.ts - Wire up task system

### Build Configuration
- vite.config.ts - Add worker configuration
- tsconfig.json - Update for worker support

### Type Definitions
- src/vite-env.d.ts - Add worker type definitions

## 1. Task Queue System

Create a new TaskQueue class to manage background operations:
```typescript
interface Task {
  id: string;
  type: 'octree' | 'mesh';
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  result?: OctreeNode | THREE.Mesh;
  error?: Error;
}
```

## 2. Web Worker Architecture

### Main Thread
- TaskQueue manages task state and UI updates
- Renderer shows progress bars
- State manager tracks active tasks

### Worker Thread
- Handles computationally intensive operations:
  - Octree subdivision
  - Mesh generation
  - SDF evaluation

## 3. Implementation Steps

1. Create Worker Infrastructure
   - Add worker.ts for octree/mesh computation
   - Set up message passing interface
   - Add progress reporting

2. Update State Management
   - Add task tracking to StateManager
   - Add progress bar UI components
   - Implement task cancellation

3. Modify Existing Code
   - Split OctreeNode.subdivide into chunks
   - Add progress callbacks to MeshGenerator
   - Make evaluation async-capable

4. UI Integration
   - Add progress bars to menu bar (top right)
   - Show task status and cancel buttons
   - Add error handling UI

## 4. File Changes Required

### Phase 1: Infrastructure
- Create src/workers/worker.ts
- Create src/workers/messages.ts
- Add TaskQueue to state manager
- Add progress UI components

### Phase 2: Core Changes
- Modify octree.ts for chunked processing
- Update meshgen.ts for progress reporting
- Add async variants of core algorithms

### Phase 3: Integration
- Update main.ts for worker management
- Add progress UI to settings panel
- Implement error handling

## 5. Migration Strategy

1. Add infrastructure without breaking existing code
2. Gradually migrate features to async
3. Add progress reporting
4. Switch to new system once stable

## 6. Testing Strategy

- Unit tests for task queue
- Integration tests for worker communication
- UI tests for progress reporting
- Error handling verification

## 7. Dependencies to Add
```json
{
  "devDependencies": {
    "comlink": "^4.4.1",           // Type-safe worker communication
    "worker-loader": "^3.0.8"      // Webpack worker loading
  }
}
```

# Worker Cancellation Implementation Proposal

## Current Issues

The current worker implementation in `src/worker/mesh-worker.ts` has several limitations:

1. No way to cancel long-running operations
2. Progress reporting is basic and doesn't handle phases well
3. Error handling is minimal

## Proposed Solution

### 1. Implement Cancellation Token Pattern

```typescript
// In a new file: src/worker/cancellation.ts
export interface CancellationToken {
  isCancelled: boolean;
  throwIfCancelled(): void;
}

export class CancellationTokenSource {
  private cancelled = false;
  
  get token(): CancellationToken {
    return {
      get isCancelled() { return this.cancelled; },
      throwIfCancelled: () => {
        if (this.cancelled) throw new Error('Operation cancelled');
      }
    };
  }
  
  cancel(): void {
    this.cancelled = true;
  }
}
```

### 2. Update Worker Message Types

```typescript
// In src/worker/mesh-worker.ts
interface WorkerMessage {
  type: 'start' | 'cancel';
  taskId: number;
  code?: string;
  highDetail?: boolean;
}

export interface ProgressMessage {
  type: 'progress';
  taskId: number;
  phase: 'octree' | 'mesh';
  progress: number;
  cellsProcessed?: number;
  totalCells?: number;
}

export interface CompleteMessage {
  type: 'complete';
  taskId: number;
  mesh: SerializedMesh;
}

export interface ErrorMessage {
  type: 'error';
  taskId: number;
  error: string;
  stack?: string;
}
```

### 3. Modify Octree Subdivision to Support Cancellation

```typescript
// In src/octree.ts
export function subdivideOctree(
  node: OctreeNode,
  sdf: Node,
  center: THREE.Vector3,
  size: number,
  budgetTracker: BudgetTracker,
  cancellationToken?: CancellationToken,
  progressCallback?: (cellsProcessed: number, totalCells: number) => void
): void {
  // Check for cancellation
  cancellationToken?.throwIfCancelled();
  
  // Existing code...
  
  // Report progress periodically
  if (progressCallback && (node.octant === -1 || node.octant % 8 === 0)) {
    progressCallback(budgetTracker.cellsProcessed, budgetTracker.totalBudget);
  }
  
  // Existing code...
}
```

### 4. Update Worker Implementation

```typescript
// In src/worker/mesh-worker.ts
let currentCancellationSource: CancellationTokenSource | null = null;

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  if (e.data.type === 'cancel') {
    if (currentCancellationSource) {
      currentCancellationSource.cancel();
      self.postMessage({ 
        type: 'progress', 
        taskId: e.data.taskId, 
        phase: 'cancelled', 
        progress: 0 
      });
    }
    return;
  }
  
  if (e.data.type === 'start') {
    // Cancel any existing operation
    if (currentCancellationSource) {
      currentCancellationSource.cancel();
    }
    
    // Create new cancellation source
    currentCancellationSource = new CancellationTokenSource();
    const token = currentCancellationSource.token;
    const taskId = e.data.taskId;
    
    try {
      // Parse CAD code
      token.throwIfCancelled();
      const cadAst = parseCAD(e.data.code);
      const sdfScene = moduleToSDF(cadAst);
      const sdfNode = parseSDF(sdfScene.expr);

      // Generate octree with cancellation support
      token.throwIfCancelled();
      const octree = new OctreeNode(CellState.Boundary);
      const cellBudget = e.data.highDetail ? 1000000 : 100000;
      const budgetTracker = new BudgetTracker(cellBudget);
      
      subdivideOctree(
        octree, 
        sdfNode, 
        new THREE.Vector3(0, 0, 0), 
        65536, 
        budgetTracker,
        token,
        (cellsProcessed, totalCells) => {
          self.postMessage({ 
            type: 'progress', 
            taskId, 
            phase: 'octree', 
            progress: cellsProcessed / totalCells,
            cellsProcessed,
            totalCells
          });
        }
      );

      // Generate mesh with cancellation support
      token.throwIfCancelled();
      const meshGen = new MeshGenerator(octree, sdfNode);
      meshGen.onProgress = (progress) => {
        self.postMessage({ 
          type: 'progress', 
          taskId, 
          phase: 'mesh', 
          progress 
        });
      };
      meshGen.cancellationToken = token;

      const mesh = meshGen.generate();
      self.postMessage({ type: 'complete', taskId, mesh });
    } catch (error) {
      if (error.message === 'Operation cancelled') {
        // Cancelled operation, already reported
        return;
      }
      
      // Report other errors
      self.postMessage({ 
        type: 'error', 
        taskId, 
        error: error.message,
        stack: error.stack
      });
    } finally {
      if (currentCancellationSource?.token === token) {
        currentCancellationSource = null;
      }
    }
  }
};
```

### 5. Update AppState to Support Cancellation

```typescript
// In src/state.ts
cancelCurrentOperation(): void {
  if (this.meshGenerationInProgress) {
    this.worker.postMessage({ 
      type: 'cancel', 
      taskId: this.currentTaskId 
    });
    this.meshGenerationInProgress = false;
    this.setViewMode(ViewMode.Preview);
  }
}
```

## Benefits

1. **User Control**: Users can cancel long-running operations
2. **Better Feedback**: More detailed progress reporting
3. **Robustness**: Proper error handling and recovery
4. **Responsiveness**: UI remains responsive during complex operations

## Implementation Strategy

1. Create the cancellation token implementation
2. Update the worker message types
3. Modify octree subdivision to support cancellation
4. Update the mesh generator to support cancellation
5. Enhance the AppState to handle cancellation

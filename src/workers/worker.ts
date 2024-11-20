import { WorkerMessage, WorkerTask, TaskProgress } from './messages';

// Store active tasks
const activeTasks = new Map<string, TaskProgress>();

// Handle incoming messages
self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type, taskId, data } = e.data;

  switch (type) {
    case 'start':
      try {
        const task = data as WorkerTask;
        await processTask(taskId, task);
      } catch (err) {
        sendError(taskId, err instanceof Error ? err.message : 'Unknown error');
      }
      break;
  }
};

async function processTask(taskId: string, task: WorkerTask) {
  // Initialize task progress
  const progress: TaskProgress = {
    taskId,
    type: task.type,
    progress: 0,
    status: 'running'
  };
  activeTasks.set(taskId, progress);

  try {
    switch (task.type) {
      case 'octree':
        await processOctreeTask(taskId, task);
        break;
      case 'mesh':
        await processMeshTask(taskId, task);
        break;
    }
  } catch (err) {
    sendError(taskId, err instanceof Error ? err.message : 'Unknown error');
  }
}

import { OctreeNode } from '../octree';
import { MeshGenerator } from '../meshgen';
import { parse as parseSDF } from '../sdf_expressions/parser';

async function processOctreeTask(taskId: string, task: OctreeTask) {
  try {
    // Parse SDF expression
    const ast = parseSDF(task.sdfExpression);
    
    // Create root octree node
    const octree = new OctreeNode(new THREE.Vector3(0, 0, 0), 65536, ast);
    
    // Subdivide with progress reporting
    let totalCells = 0;
    const subdivideWithProgress = (node: OctreeNode, depth: number) => {
      totalCells++;
      updateProgress(taskId, Math.min(totalCells / task.cellBudget, 0.99));
      
      if (totalCells >= task.cellBudget) {
        throw new Error('Cell budget exhausted');
      }
      
      // Continue subdivision
      const newSize = node.size / 2;
      if (newSize >= task.minSize && node.state === CellState.Boundary) {
        node.subdivide(task.minSize, task.cellBudget - totalCells);
      }
    };
    
    octree.subdivide(task.minSize, task.cellBudget);
    
    sendComplete(taskId, { result: octree });
  } catch (err) {
    sendError(taskId, err instanceof Error ? err.message : 'Unknown error');
  }
}

async function processMeshTask(taskId: string, task: MeshTask) {
  try {
    const octree = task.octreeData;
    const meshGen = new MeshGenerator(octree, task.optimize);
    
    // Add progress tracking to mesh generation
    let progress = 0;
    meshGen.onProgress = (p: number) => {
      progress = p;
      updateProgress(taskId, progress);
    };
    
    const mesh = meshGen.generate();
    sendComplete(taskId, { result: mesh });
  } catch (err) {
    sendError(taskId, err instanceof Error ? err.message : 'Unknown error');
  }
}

function updateProgress(taskId: string, progress: number) {
  const task = activeTasks.get(taskId);
  if (task) {
    task.progress = progress;
    self.postMessage({
      type: 'progress',
      taskId,
      progress
    });
  }
}

function sendComplete(taskId: string, data: any) {
  const task = activeTasks.get(taskId);
  if (task) {
    task.status = 'completed';
    task.progress = 1;
    self.postMessage({
      type: 'complete',
      taskId,
      data
    });
    activeTasks.delete(taskId);
  }
}

function sendError(taskId: string, error: string) {
  const task = activeTasks.get(taskId);
  if (task) {
    task.status = 'failed';
    task.error = error;
    self.postMessage({
      type: 'error',
      taskId,
      error
    });
    activeTasks.delete(taskId);
  }
}

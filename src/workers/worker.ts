import * as THREE from 'three';
import { WorkerMessage, WorkerTask, TaskProgress } from './messages';
import { Interval } from '../interval';

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
    console.log('Received source code:', task.source);
    
    // Parse CAD code into SDF expression
    const cadAst = parseCAD(task.source);
    const sdfExpr = moduleToSDF(cadAst);
    const ast = parseSDF(sdfExpr);
    
    console.log('Parsed AST:', ast);
    
    console.log('Starting octree generation with settings:', {
      minSize: task.minSize,
      cellBudget: task.cellBudget
    });

    console.log('Creating root octree node at origin with size 65536');
    const octree = new OctreeNode(new THREE.Vector3(0, 0, 0), 65536, ast);
    
    // Track subdivision progress
    let totalCells = 0;
    const onProgress = (cells: number) => {
      totalCells = cells;
      const progress = Math.min(totalCells / task.cellBudget, 0.99);
      console.log(`Octree subdivision progress: ${(progress * 100).toFixed(1)}% (${totalCells} cells)`);
      if (cells % 1000 === 0) {
        console.log(`Cell states: Inside=${octree.countInside()}, Outside=${octree.countOutside()}, Boundary=${octree.countBoundary()}`);
      }
      updateProgress(taskId, progress);
    };
    
    // Subdivide with progress tracking
    await octree.subdivide(
      task.minSize, 
      task.cellBudget,
      undefined, // renderSettings not needed in worker
      onProgress
    );
    
    // Send completed octree back
    sendComplete(taskId, { 
      result: octree,
      cellCount: totalCells
    });
  } catch (err) {
    sendError(taskId, err instanceof Error ? err.message : 'Unknown error');
  }
}

async function processMeshTask(taskId: string, task: MeshTask) {
  try {
    const meshGen = new MeshGenerator(task.octree, task.optimize);
    
    // Add progress tracking to mesh generation
    meshGen.onProgress = (progress: number) => {
      updateProgress(taskId, progress);
    };
    
    const mesh = meshGen.generate();
    
    // Transfer the mesh data back to main thread
    const serializedMesh = {
      geometry: mesh.geometry.toJSON(),
      material: mesh.material.toJSON()
    };
    
    sendComplete(taskId, { result: serializedMesh });
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

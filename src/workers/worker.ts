import * as THREE from 'three';
import { WorkerMessage, WorkerTask, TaskProgress } from './messages';
import { Interval } from '../interval';
import { parse as parseCAD } from '../cad/parser';
import { moduleToSDF } from '../cad/builtins';
import { parse as parseSDF } from '../sdf_expressions/parser';

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

import { OctreeNode, createOctreeNode } from '../octree';
import { MeshGenerator } from '../meshgen';
import { parse as parseSDF } from '../sdf_expressions/parser';

async function processOctreeTask(taskId: string, task: OctreeTask) {
  try {
    // Parse CAD code into SDF expression
    const cadAst = parseCAD(task.source);
    const sdfExpr = moduleToSDF(cadAst);
    const sdf = parseSDF(sdfExpr);
    
    console.log('Starting octree task with budget:', task.cellBudget);
    const octree = createOctreeNode(new THREE.Vector3(0, 0, 0), 65536, sdf);
    
    // Track subdivision progress
    let totalCells = 0;
    const onProgress = (cells: number) => {
      totalCells = cells;
      const progress = Math.min(totalCells / task.cellBudget, 0.99);
      console.log(`Octree progress: ${(progress * 100).toFixed(1)}% (${totalCells} cells)`);
      updateProgress(taskId, progress);
    };
    
    // Subdivide with progress tracking
    await octree.subdivide(
      sdf,
      task.minSize, 
      task.cellBudget,
      undefined, // renderSettings not needed in worker
      onProgress
    );
    
    console.log(`Octree generation complete with ${totalCells} cells`);
    console.log('Preparing to send octree result back to main thread');
    
    // Ensure we send a proper OctreeNode instance with all required data
    const serializeNode = (node: OctreeNode): any => ({
      center: node.center,
      size: node.size,
      state: node.state,
      children: node.children.map(child => child ? serializeNode(child) : null),
      octant: node.octant
    });

    const serializedOctree = serializeNode(octree);

    const result = { 
      result: serializedOctree,
      cellCount: totalCells
    };
    console.log('Sending octree result via postMessage:', result);
    sendComplete(taskId, result);
    console.log('Octree result sent');
  } catch (err) {
    sendError(taskId, err instanceof Error ? err.message : 'Unknown error');
  }
}

async function processMeshTask(taskId: string, task: MeshTask) {
  try {
    // Reconstruct OctreeNode with proper prototype chain
    const reconstructOctree = (data: any, parent: OctreeNode | null = null): OctreeNode => {
      if (!data) {
        throw new Error('Cannot reconstruct null octree data');
      }
      
      const center = new THREE.Vector3(data.center.x, data.center.y, data.center.z);
      
      const node = Object.assign(new OctreeNode(
        center,
        data.size,
        data.state,
        parent,
        data.octant
      ), {
        children: new Array(8).fill(null)
      });
      
      if (Array.isArray(data.children)) {
        node.children = data.children.map((child: any) => 
          child ? reconstructOctree(child, node) : null
        );
      }
      
      return node;
    };

    const octree = reconstructOctree(task.octree);
    const meshGen = new MeshGenerator(octree, task.optimize);
    
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

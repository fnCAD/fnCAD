import { OctreeNode } from '../octree';
import { SerializedMesh, OctreeTask, MeshTask } from '../types';

export type TaskType = 'octree' | 'mesh';

export interface TaskProgress {
  taskId: string;
  type: TaskType;
  progress: number;
  status: 'queued' | 'running' | 'completed' | 'failed';
  error?: string;
  result?: SerializedMesh | OctreeNode;
}

export type WorkerTask = OctreeTask | MeshTask;

export interface WorkerMessage {
  type: 'start' | 'progress' | 'complete' | 'error';
  taskId: string;
  data?: {
    result?: SerializedMesh | OctreeNode;
    cellCount?: number;
  };
  progress?: number;
  status?: 'queued' | 'running' | 'completed' | 'failed';
  error?: string;
}

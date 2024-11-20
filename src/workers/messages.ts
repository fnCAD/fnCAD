export type TaskType = 'octree' | 'mesh';

export interface TaskProgress {
  taskId: string;
  type: TaskType;
  progress: number;
  status: 'queued' | 'running' | 'completed' | 'failed';
  error?: string;
}

export interface OctreeTask {
  type: 'octree';
  minSize: number;
  cellBudget: number;
  source: string;
  sdf: Node;
}

export interface MeshTask {
  type: 'mesh';
  optimize: boolean;
  octree: OctreeNode;
}

export type WorkerTask = OctreeTask | MeshTask;

export interface WorkerMessage {
  type: 'start' | 'progress' | 'complete' | 'error';
  taskId: string;
  data?: any;
  progress?: number;
  error?: string;
}

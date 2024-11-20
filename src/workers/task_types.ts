import { SerializedMesh } from '../types';
import { OctreeNode } from '../octree';

export interface TaskProgress {
  taskId: string;
  type: 'octree' | 'mesh';
  progress: number;
  status: 'queued' | 'running' | 'completed' | 'failed';
  error?: string;
  result?: SerializedMesh | OctreeNode;
}

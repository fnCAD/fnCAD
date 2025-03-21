import { parse as parseCAD } from '../cad/parser';
import { moduleToSDF } from '../cad/builtins';
import { parse as parseSDF } from '../sdf_expressions/parser';
import { OctreeNode, CellState, subdivideOctree } from '../octree';
import { MeshGenerator } from '../meshgen';
import { Vector3 } from 'three';
import { SerializedMesh } from '../types';

interface WorkerMessage {
  type: 'start';
  taskId: number;
  code: string;
}

export interface ProgressMessage {
  type: 'progress';
  taskId: number;
  phase: 'octree' | 'mesh';
  progress: number;
}

export interface CompleteMessage {
  type: 'complete';
  taskId: number;
  mesh: SerializedMesh;
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  if (e.data.type === 'start') {
    // Parse CAD code
    const cadAst = parseCAD(e.data.code);
    const taskId = e.data.taskId;
    const sdfScene = moduleToSDF(cadAst);
    const sdfNode = parseSDF(sdfScene.expr);

    // Generate octree
    const octree = new OctreeNode(CellState.Boundary);

    // Report octree progress periodically
    // let lastProgress = 0;
    subdivideOctree(octree, sdfNode, new Vector3(0, 0, 0), 65536);
    /*, (progress) => {
      if (progress - lastProgress > 0.01) {
        self.postMessage({ type: 'progress', phase: 'octree', taskId, progress });
        lastProgress = progress;
      }
    });*/

    // Generate mesh
    const meshGen = new MeshGenerator(octree, sdfNode);
    meshGen.onProgress = (progress) => {
      self.postMessage({ type: 'progress', phase: 'mesh', taskId, progress });
    };

    const mesh = meshGen.generate();
    self.postMessage({ type: 'complete', taskId, mesh });
  }
};

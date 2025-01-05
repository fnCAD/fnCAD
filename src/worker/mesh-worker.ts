import { parse as parseCAD } from '../cad/parser';
import { moduleToSDF } from '../cad/builtins';
import { parse as parseSDF } from '../sdf_expressions/parser';
import { OctreeNode, CellState, subdivideOctree } from '../octree';
import { MeshGenerator } from '../meshgen';
import { Vector3 } from 'three';
import { SerializedMesh } from '../types';

interface WorkerMessage {
  type: 'start';
  code: string;
  highDetail: boolean;
}

interface ProgressMessage {
  type: 'progress';
  phase: 'octree' | 'mesh';
  progress: number;
}

interface CompleteMessage {
  type: 'complete';
  mesh: SerializedMesh;
}

type OutMessage = ProgressMessage | CompleteMessage;

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  if (e.data.type === 'start') {
    // Parse CAD code
    const cadAst = parseCAD(e.data.code);
    const taskId = e.data.taskId;
    const sdfExpr = moduleToSDF(cadAst);
    const sdfNode = parseSDF(sdfExpr);

    // Generate octree
    const octree = new OctreeNode(CellState.Boundary);
    const minSize = e.data.highDetail ? 0.1 : 0.5;
    const cellBudget = e.data.highDetail ? 100000 : 10000;

    // Report octree progress periodically
    let lastProgress = 0;
    subdivideOctree(
      octree,
      sdfNode,
      new Vector3(0, 0, 0),
      65536,
      minSize,
      cellBudget,
      (progress) => {
        if (progress - lastProgress > 0.01) {
          self.postMessage({ type: 'progress', phase: 'octree', taskId, progress });
          lastProgress = progress;
        }
      }
    );

    // Generate mesh
    const meshGen = new MeshGenerator(octree, sdfNode, true);
    meshGen.onProgress = (progress) => {
      self.postMessage({ type: 'progress', phase: 'mesh', taskId, progress });
    };

    const mesh = meshGen.generate(minSize);
    self.postMessage({ type: 'complete', taskId, mesh });
  }
};

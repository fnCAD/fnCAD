import { OctreeNode } from './octree';
import { Node as SDFNode } from './sdf_expressions/ast';

export interface SerializedMesh {
  vertices: number[];  // Flat array of vertex positions [x,y,z, x,y,z, ...]
  indices: number[];   // Triangle indices
}

export interface OctreeTask {
  type: 'octree';
  minSize: number;
  cellBudget: number;
  source: string;
}

export interface MeshTask {
  type: 'mesh';
  optimize: boolean;
  octree: OctreeNode;
  source: string;  // Source code to parse SDF from
}

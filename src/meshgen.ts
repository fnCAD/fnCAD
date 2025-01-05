import * as THREE from 'three';
import { SerializedMesh } from './types';
import { HalfEdgeMesh } from './halfedge';
import { OctreeNode, Direction, CellState, octreeChildCenter } from './octree';
import { Node } from './sdf_expressions/types';

/**
 * Generates a triangle mesh from an octree representation of an SDF
 * boundary. Uses a half-edge mesh data structure for robust topology handling.
 *
 * SCALABILITY:
 * This approach scales well in practice because:
 * 1. Boundary cells naturally scale with surface area rather than volume
 * 2. Physical 3D printing constraints already limit the meaningful object size
 * 3. The separate mesh refinement step (see FINE_SUBDIVISION.md) can adaptively
 *    improve surface detail where needed, since triangle meshes are easier to
 *    manipulate locally than octrees
 */
export class MeshGenerator {
  onProgress?: (progress: number) => void;

  // Cache to reuse vertices at shared corners
  private vertexCache = new Map<string, number>();

  // Queue of edges that need splitting
  private splitQueue: Array<{
    start: THREE.Vector3;
    end: THREE.Vector3;
    split: THREE.Vector3;
  }> = [];

  constructor(
    private octree: OctreeNode,
    private sdf: Node,
    private optimize: boolean = false
  ) {}

  private reportProgress(progress: number) {
    if (this.onProgress) {
      this.onProgress(Math.min(1, Math.max(0, progress)));
    }
  }

  generate(minSize: number): SerializedMesh {
    // Create half-edge mesh
    const mesh = new HalfEdgeMesh();

    // Phase 1: Extract surface mesh from octree (0-40%)
    this.reportProgress(0);
    this.extractMeshFromOctree(this.octree, mesh, new THREE.Vector3(0, 0, 0), 65536);
    this.reportProgress(0.4);

    // Phase 2: Process edge splits (40-50%)
    this.reportProgress(0.4);
    for (const { start, end, split } of this.splitQueue) {
      const startIdx = this.getVertexIndex(start, mesh);
      const endIdx = this.getVertexIndex(end, mesh);
      const splitIdx = this.getVertexIndex(split, mesh);
      mesh.lateSplitEdge(startIdx, endIdx, splitIdx);
    }
    this.reportProgress(0.5);

    // Phase 3: Optimize vertices if enabled (50-55%)
    if (this.optimize) {
      var fn = new Function(
        'x',
        'y',
        'z',
        'return ' + this.sdf.evaluateStr('x', 'y', 'z', 1) + ';'
      );
      mesh.refineEdges((pos) => fn(pos.x, pos.y, pos.z), {
        errorThreshold: minSize / 100.0,
        maxSubdivisions: mesh.halfEdges.length,
        minEdgeLength: minSize / 100.0,
      });
      this.reportProgress(0.55);
    }

    // Phase 3: Verify mesh is manifold (55-60%)
    if (!mesh.isManifold()) {
      throw new Error('Generated mesh is not manifold');
    }
    this.reportProgress(0.6);

    // Phase 3: Convert to serialized format (60-100%)
    const serialized = mesh.toSerializedMesh();
    this.reportProgress(1.0);

    return serialized;
  }

  private extractMeshFromOctree(
    node: OctreeNode,
    mesh: HalfEdgeMesh,
    center: THREE.Vector3,
    size: number
  ) {
    // Only add faces for leaf boundary nodes
    if (node.state === CellState.Boundary) {
      this.addCellFaces(node, mesh, center, size);
      return;
    }
    if (node.state == CellState.Outside || node.state == CellState.Inside) {
      return;
    }

    // Recurse into children for subdivided nodes
    const half = size / 2;
    node.state.forEach((child, index) => {
      this.extractMeshFromOctree(child, mesh, octreeChildCenter(index, center, half), half);
    });
  }

  private getVertexIndex(pos: THREE.Vector3, mesh: HalfEdgeMesh): number {
    // Use position as cache key with some precision limit
    const key = `${pos.x.toFixed(6)},${pos.y.toFixed(6)},${pos.z.toFixed(6)}`;

    const cached = this.vertexCache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const index = mesh.addVertex(pos);
    this.vertexCache.set(key, index);
    return index;
  }

  private addCellFaces(node: OctreeNode, mesh: HalfEdgeMesh, center: THREE.Vector3, size: number) {
    const half = size / 2;
    const self = this;
    const indexes: (number | null)[] = Array(8).fill(null);
    function vertexIndex(corner: number): number {
      if (indexes[corner] === null) {
        const x = (corner & 1) !== 0 ? 1 : -1;
        const y = (corner & 2) !== 0 ? 1 : -1;
        const z = (corner & 4) !== 0 ? 1 : -1;
        const pos = new THREE.Vector3(
          center.x + x * half,
          center.y + y * half,
          center.z + z * half
        );
        indexes[corner] = self.getVertexIndex(pos, mesh);
      }
      return indexes[corner];
    }

    // Define faces with their normal directions
    const faces = [
      { vertices: [1, 3, 5, 7], direction: Direction.PosX }, // Right
      { vertices: [0, 2, 4, 6], direction: Direction.NegX }, // Left
      { vertices: [2, 3, 6, 7], direction: Direction.PosY }, // Top
      { vertices: [0, 1, 4, 5], direction: Direction.NegY }, // Bottom
      { vertices: [4, 5, 6, 7], direction: Direction.PosZ }, // Back
      { vertices: [0, 1, 2, 3], direction: Direction.NegZ }, // Front
    ];

    // Add faces checking neighbors
    faces.forEach((face) => {
      const neighbor = node.getNeighborAtLevel(face.direction);

      this.considerNeighborFace(
        neighbor,
        face.vertices.map((a) => vertexIndex(a)),
        size,
        face.direction,
        mesh
      );
    });
  }

  private considerNeighborFace(
    neighbor: OctreeNode | null,
    vertices: number[],
    size: number,
    direction: Direction,
    mesh: HalfEdgeMesh
  ) {
    if (!neighbor || neighbor.state === CellState.Outside) {
      // Flip winding for NegX, PosY, and NegZ faces (empirically determined)
      if (direction === Direction.NegX || direction === Direction.PosY || direction === Direction.NegZ) {
        mesh.addFace(vertices[0], vertices[2], vertices[1]);
        mesh.addFace(vertices[2], vertices[3], vertices[1]);
      } else {
        mesh.addFace(vertices[0], vertices[1], vertices[2]);
        mesh.addFace(vertices[2], vertices[1], vertices[3]);
      }
    } else if (Array.isArray(neighbor.state)) {
      const childIndices = this.getAdjacentChildIndices(direction);
      const quadVertices = this.getQuadrantVertices(vertices, mesh);

      // For each quadrant of the face
      for (let i = 0; i < 4; i++) {
        const childNeighbor = neighbor.state[childIndices[i]];
        this.considerNeighborFace(childNeighbor, quadVertices[i], size / 2, direction, mesh);
      }
    }
  }

  private getAdjacentChildIndices(direction: Direction): number[] {
    switch (direction) {
      case Direction.PosX:
        return [0, 2, 4, 6];
      case Direction.NegX:
        return [1, 3, 5, 7];
      case Direction.PosY:
        return [0, 1, 4, 5];
      case Direction.NegY:
        return [2, 3, 6, 7];
      case Direction.PosZ:
        return [0, 1, 2, 3];
      case Direction.NegZ:
        return [4, 5, 6, 7];
    }
  }

  private getQuadrantVertices(faceVertices: number[], mesh: HalfEdgeMesh): number[][] {
    // Calculate vertices for each quadrant of the face
    const quadrantOffsets = [
      [0, 0], // Bottom left
      [1, 0], // Bottom right
      [0, 1], // Top left
      [1, 1], // Top right
    ];

    const dx = mesh.vertices[faceVertices[1]].position
      .clone()
      .sub(mesh.vertices[faceVertices[0]].position);
    const dy = mesh.vertices[faceVertices[2]].position
      .clone()
      .sub(mesh.vertices[faceVertices[0]].position);
    const hdx = dx.clone().divideScalar(2);
    const hdy = dy.clone().divideScalar(2);
    const base = mesh.vertices[faceVertices[0]].position;

    // Calculate all vertices for the 3x3 grid created by splitting each edge
    const vertices: THREE.Vector3[] = [];
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        vertices.push(base.clone().addScaledVector(hdx, x).addScaledVector(hdy, y));
      }
    }

    // Queue edge splits for external edges.
    // horizontal
    this.splitQueue.push({
      start: vertices[0],
      split: vertices[1],
      end: vertices[2],
    });
    this.splitQueue.push({
      start: vertices[6],
      split: vertices[7],
      end: vertices[8],
    });
    // vertical
    this.splitQueue.push({
      start: vertices[0],
      split: vertices[3],
      end: vertices[6],
    });
    this.splitQueue.push({
      start: vertices[2],
      split: vertices[5],
      end: vertices[8],
    });

    return quadrantOffsets.map(([x, y]) => {
      return [
        this.getVertexIndex(vertices[y * 3 + x], mesh),
        this.getVertexIndex(vertices[y * 3 + (x + 1)], mesh),
        this.getVertexIndex(vertices[(y + 1) * 3 + x], mesh),
        this.getVertexIndex(vertices[(y + 1) * 3 + (x + 1)], mesh),
      ];
    });
  }
}

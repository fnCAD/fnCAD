import { Node } from './sdf_expressions/ast';
import { Interval } from './interval';
import * as THREE from 'three';

export enum CellState {
  Inside,
  Outside,
  Boundary,
  BoundarySubdivided
}

export enum Direction {
  PosX,
  NegX,
  PosY,
  NegY,
  PosZ,
  NegZ
}

export class OctreeNode {
  // (z << 2) | (y << 1) | x
  // pos 1 == index 0, pos -1 == index 1
  children: (OctreeNode | null)[] = new Array(8).fill(null);
  state!: CellState;

  constructor(
    public center: THREE.Vector3,
    public size: number,
    state: CellState,
    public parent: OctreeNode | null = null,
    public octant: number = -1
  ) {
    // Validate size
    if (size <= 0) {
      throw new Error(`Invalid octree node size: ${size}`);
    }
    this.state = state;
  }

  private getNeighborOctant(direction: Direction): number {
    // Octant mapping for each direction
    const octantMaps = {
      [Direction.PosX]: [1, 0, 3, 2, 5, 4, 7, 6],
      [Direction.NegX]: [1, 0, 3, 2, 5, 4, 7, 6],
      [Direction.PosY]: [2, 3, 0, 1, 6, 7, 4, 5],
      [Direction.NegY]: [2, 3, 0, 1, 6, 7, 4, 5],
      [Direction.PosZ]: [4, 5, 6, 7, 0, 1, 2, 3],
      [Direction.NegZ]: [4, 5, 6, 7, 0, 1, 2, 3]
    };
    return octantMaps[direction][this.octant];
  }

  private getMirrorOctant(direction: Direction): number {
    // Mirror the octant across the appropriate axis
    switch (direction) {
      case Direction.PosX:
      case Direction.NegX:
        return this.octant ^ 1; // Flip x bit
      case Direction.PosY:
      case Direction.NegY:
        return this.octant ^ 2; // Flip y bit
      case Direction.PosZ:
      case Direction.NegZ:
        return this.octant ^ 4; // Flip z bit
    }
  }

  private isNeighborInSameParent(direction: Direction): boolean {
    // Check if moving in the given direction stays within the same parent
    switch (direction) {
      case Direction.PosX:
        return (this.octant & 1) === 0; // x bit is 0
      case Direction.NegX:
        return (this.octant & 1) === 1; // x bit is 1
      case Direction.PosY:
        return (this.octant & 2) === 0; // y bit is 0
      case Direction.NegY:
        return (this.octant & 2) === 2; // y bit is 1
      case Direction.PosZ:
        return (this.octant & 4) === 0; // z bit is 0
      case Direction.NegZ:
        return (this.octant & 4) === 4; // z bit is 1
    }
  }

  getNeighborAtLevel(direction: Direction): OctreeNode | null {
    // If at root, handle boundary case
    if (!this.parent) {
      return null;
    }

    // If neighbor is in same parent, just return sibling
    if (this.isNeighborInSameParent(direction)) {
      const neighborOctant = this.getNeighborOctant(direction);
      return this.parent.children[neighborOctant];
    }

    // Otherwise get parent's neighbor and traverse down
    const parentNeighbor = this.parent.getNeighborAtLevel(direction);
    if (!parentNeighbor) {
      return null;
    }

    // Return appropriate child of parent's neighbor
    const targetOctant = this.getMirrorOctant(direction);
    return parentNeighbor.children[targetOctant] || parentNeighbor;
  }

  isSurfaceCell(): boolean {
    // Only leaf boundary cells are surface cells
    return this.state === CellState.Boundary;
  }

  isFullyInside(): boolean {
    return this.state === CellState.Inside;
  }

  isFullyOutside(): boolean {
    return this.state === CellState.Outside;
  }

  getCellCount(): number {
    let count = 1; // Count this node
    for (const child of this.children) {
      if (child) {
        count += child.getCellCount();
      }
    }
    return count;
  }

  countInside(): number {
    if (this.state === CellState.Inside) return 1;
    let count = 0;
    for (const child of this.children) {
      if (child) count += child.countInside();
    }
    return count;
  }

  countOutside(): number {
    if (this.state === CellState.Outside) return 1;
    let count = 0;
    for (const child of this.children) {
      if (child) count += child.countOutside();
    }
    return count;
  }

  countBoundary(): number {
    // Only count leaf boundary cells, not subdivided ones
    if (this.state === CellState.Boundary) return 1;
    let count = 0;
    for (const child of this.children) {
      if (child) count += child.countBoundary();
    }
    return count;
  }
}

export function createOctreeNode(
  center: THREE.Vector3,
  size: number,
  sdf: Node,
  parent: OctreeNode | null = null,
  octant: number = -1
): OctreeNode {
  // Evaluate content over the cube bounds to determine initial state
  const half = size / 2;
  const rangeX = new Interval(center.x - half, center.x + half);
  const rangeY = new Interval(center.y - half, center.y + half);
  const rangeZ = new Interval(center.z - half, center.z + half);
  const content = sdf.evaluateContent(rangeX, rangeY, rangeZ);

  // Determine cell state based on content category
  let state: CellState;
  if (!content) {
    // Null content (plain arithmetic). This should never happen, but
    // for now just fall back to interval evaluation.
    const interval = sdf.evaluateInterval(rangeX, rangeY, rangeZ);

    state = interval.max < 0 ? CellState.Inside :
            interval.min > 0 ? CellState.Outside :
            CellState.Boundary;
  } else {
    switch (content.category) {
      case 'inside': state = CellState.Inside; break;
      case 'outside': state = CellState.Outside; break;
      case 'face': state = CellState.Boundary; break;
      // TODO: boundary of special interest, mark for extended subdivision.
      case 'edge': state = CellState.Boundary; break;
    }
  }

  return new OctreeNode(center, size, state, parent, octant);
}

export function subdivideOctree(
  node: OctreeNode,
  sdf: Node,
  minSize: number = 0.1,
  cellBudget: number = 100000,
  onProgress?: (cells: number) => void
): number {
  let totalCells = 1;
  const newSize = node.size / 2;

  // If we're not a boundary cell, stop subdividing
  if (node.state !== CellState.Boundary) {
    return 1;
  }

  // If we've reached minimum size, stay as boundary cell
  if (newSize < minSize) {
    return 1;
  }

  // If no budget left, throw
  if (cellBudget <= 1) {
    throw new Error('Cell budget exhausted');
  }

  // Decrement budget for this cell
  cellBudget--;

  // Create 8 children with new size
  const half = node.size/2;
  const offsets = [
    [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
    [-1, -1, 1],  [1, -1, 1],  [-1, 1, 1],  [1, 1, 1]
  ];

  // Mark boundary cells as subdivided before creating children
  if (node.state === CellState.Boundary) {
    node.state = CellState.BoundarySubdivided;
  }

  for (let i = 0; i < 8; i++) {
    const [x, y, z] = offsets[i];
    const childCenter = new THREE.Vector3(
      node.center.x + x * half/2,
      node.center.y + y * half/2,
      node.center.z + z * half/2
    );
    const childNode = createOctreeNode(childCenter, newSize, sdf, node);
    childNode.octant = i;
    node.children[i] = childNode;

    // Try to subdivide child with current budget
    const child = node.children[i];
    if (!child) continue;

    const cellsCreated = subdivideOctree(child, sdf, minSize, cellBudget);
    totalCells += cellsCreated;
    cellBudget -= cellsCreated;

    if (cellBudget <= 0) {
      console.log('Cell budget exhausted during subdivision');
      break;
    }
  }


  // Report progress if callback provided
  if (onProgress) {
    onProgress(totalCells);
  }

  // Return number of cells created
  return totalCells;
}

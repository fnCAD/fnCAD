import { Node, Content } from './sdf_expressions/types';
import { Interval } from './interval';
import * as THREE from 'three';

export enum CellState {
  Inside,
  Outside,
  Boundary,
}

export enum Direction {
  PosX,
  NegX,
  PosY,
  NegY,
  PosZ,
  NegZ,
}

export class OctreeNode {
  // (z << 2) | (y << 1) | x
  // [-1, 1]
  constructor(
    public state: CellState | OctreeNode[],
    public readonly parent: OctreeNode | null = null,
    public readonly octant: number = -1,
    public readonly content: Content = null
  ) {}

  public children(): OctreeNode[] | null {
    if (Array.isArray(this.state)) return this.state;
    return null;
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

  /**
   * This function can return a neighbor above the level of `this`,
   * but when it does, it has to be Inside, Outside, Boundary or `null`.
   */
  getNeighborAtLevel(direction: Direction): OctreeNode | null {
    // If at root, handle boundary case
    if (!this.parent) {
      return null;
    }

    // If neighbor is in same parent, just return sibling
    if (this.isNeighborInSameParent(direction)) {
      const neighborOctant = this.getMirrorOctant(direction);
      // TODO enforce in constructor/invariant?
      if (!Array.isArray(this.parent.state)) throw new Error('Parent logic error.');
      return this.parent.state[neighborOctant];
    }

    // Otherwise get parent's neighbor and traverse down
    const parentNeighbor = this.parent.getNeighborAtLevel(direction);
    if (!parentNeighbor || !Array.isArray(parentNeighbor.state)) {
      return parentNeighbor;
    }

    // Return appropriate child of parent's neighbor
    const targetOctant = this.getMirrorOctant(direction);
    return parentNeighbor.state[targetOctant];
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
    if (Array.isArray(this.state)) {
      for (const child of this.state) {
        count += child.getCellCount();
      }
    }
    return count;
  }

  countInside(): number {
    if (this.state === CellState.Inside) return 1;
    let count = 0;
    if (Array.isArray(this.state)) {
      for (const child of this.state) {
        count += child.countInside();
      }
    }
    return count;
  }

  countOutside(): number {
    if (this.state === CellState.Outside) return 1;
    let count = 0;
    if (Array.isArray(this.state)) {
      for (const child of this.state) {
        count += child.countOutside();
      }
    }
    return count;
  }

  countBoundary(): number {
    // Only count leaf boundary cells, not subdivided ones
    if (this.state === CellState.Boundary) return 1;
    let count = 0;
    if (Array.isArray(this.state)) {
      for (const child of this.state) {
        count += child.countBoundary();
      }
    }
    return count;
  }
}

export function octreeChildCenter(
  index: number,
  center: THREE.Vector3,
  half: number
): THREE.Vector3 {
  const quart = half / 2;
  const xDir = (index & 1) !== 0 ? 1 : -1;
  const yDir = (index & 2) !== 0 ? 1 : -1;
  const zDir = (index & 4) !== 0 ? 1 : -1;
  return new THREE.Vector3(
    center.x + xDir * quart,
    center.y + yDir * quart,
    center.z + zDir * quart
  );
}

export function subdivideOctree(
  node: OctreeNode,
  sdf: Node,
  center: THREE.Vector3,
  size: number,
  cellBudget: number = 100000,
  onProgress?: (cells: number) => void
): number {
  let totalCells = 1;
  const half = size / 2;
  const quart = size / 4;

  // If no budget left, throw
  if (cellBudget <= 1) {
    throw new Error('Cell budget exhausted');
  }

  // Decrement budget for this cell
  cellBudget--;

  // Mark cell as subdivided before creating children
  var children: OctreeNode[] = [];
  node.state = children;

  for (let i = 0; i < 8; i++) {
    const childCenter = octreeChildCenter(i, center, half);

    // Evaluate content over the cube bounds to determine initial state
    const contentRange = quart * 1.1; // scale up by 10% to catch edge cases
    const rangeX = new Interval(childCenter.x - contentRange, childCenter.x + contentRange);
    const rangeY = new Interval(childCenter.y - contentRange, childCenter.y + contentRange);
    const rangeZ = new Interval(childCenter.z - contentRange, childCenter.z + contentRange);
    var content = sdf.evaluateContent(rangeX, rangeY, rangeZ);

    // Determine cell state based on content category
    var adjMinSize = content?.minSize || 0.01;
    let state: CellState;
    if (!content) {
      // Null content (plain arithmetic). This should never happen, but
      // for now just fall back to interval evaluation.
      const interval = sdf.evaluateInterval(rangeX, rangeY, rangeZ);

      state =
        interval.max < 0
          ? CellState.Inside
          : interval.min > 0
            ? CellState.Outside
            : CellState.Boundary;
    } else {
      switch (content.category) {
        case 'inside':
          state = CellState.Inside;
          break;
        case 'outside':
          state = CellState.Outside;
          break;
        case 'face':
          state = CellState.Boundary;
          break;
        // Complex region (multiple faces or overlapping SDFs), mark for extended subdivision
        case 'complex':
          state = CellState.Boundary;
          adjMinSize /= 8;
          break;
      }
    }
    children.push(new OctreeNode(state, node, i, content));

    // Only subdivide boundary cells if above adjusted minimum size
    if (state !== CellState.Boundary || quart < adjMinSize) {
      continue;
    }

    // Try to subdivide child with current budget
    const cellsCreated = subdivideOctree(children[i], sdf, childCenter, half, cellBudget);
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

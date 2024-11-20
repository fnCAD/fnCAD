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

// Convert Vector3 direction to enum
function vectorToDirection(direction: THREE.Vector3): Direction {
  if (Math.abs(direction.x) > Math.abs(direction.y) && Math.abs(direction.x) > Math.abs(direction.z)) {
    return direction.x > 0 ? Direction.PosX : Direction.NegX;
  } else if (Math.abs(direction.y) > Math.abs(direction.z)) {
    return direction.y > 0 ? Direction.PosY : Direction.NegY;
  } else {
    return direction.z > 0 ? Direction.PosZ : Direction.NegZ;
  }
}

export class OctreeNode {
  children: (OctreeNode | null)[] = new Array(8).fill(null);
  state: CellState;

  dup(): OctreeNode {
    const copy = new OctreeNode(
      this.center.clone(),
      this.size,
      this.sdf,
      this.parent,
      this.octant
    );
    copy.state = this.state;
    copy.children = this.children.map(child => child?.dup() || null);
    return copy;
  }


  constructor(
    public center: THREE.Vector3,
    public size: number,
    private sdfSource: string,
    public parent: OctreeNode | null = null,
    public octant: number = -1
  ) {
    // Parse SDF expression from source
    const ast = parseSDF(sdfSource);
    this.sdf = ast;
    // Validate size
    if (size <= 0) {
      throw new Error(`Invalid octree node size: ${size}`);
    }

    console.log(`Creating octree node at ${center.toArray()} with size ${size}`);
    
    // Compute and cache state during construction
    const interval = this.evaluate();
    console.log(`Node interval evaluation: ${interval.min} to ${interval.max}`);
    if (interval.max < 0) {
      this.state = CellState.Inside;
    } else if (interval.min > 0) {
      this.state = CellState.Outside;
    } else {
      // Start as regular boundary, will be updated to BoundarySubdivided if needed
      this.state = CellState.Boundary;
    }
  }

  private getNeighborOctant(octant: number, direction: Direction): number {
    // Octant mapping for each direction
    const octantMaps = {
      [Direction.PosX]: [1, 0, 3, 2, 5, 4, 7, 6],
      [Direction.NegX]: [1, 0, 3, 2, 5, 4, 7, 6],
      [Direction.PosY]: [2, 3, 0, 1, 6, 7, 4, 5],
      [Direction.NegY]: [2, 3, 0, 1, 6, 7, 4, 5],
      [Direction.PosZ]: [4, 5, 6, 7, 0, 1, 2, 3],
      [Direction.NegZ]: [4, 5, 6, 7, 0, 1, 2, 3]
    };
    return octantMaps[direction][octant];
  }

  private getMirrorOctant(octant: number, direction: Direction): number {
    // Mirror the octant across the appropriate axis
    switch (direction) {
      case Direction.PosX:
      case Direction.NegX:
        return octant ^ 1; // Flip x bit
      case Direction.PosY:
      case Direction.NegY:
        return octant ^ 2; // Flip y bit
      case Direction.PosZ:
      case Direction.NegZ:
        return octant ^ 4; // Flip z bit
    }
  }

  private isNeighborInSameParent(octant: number, direction: Direction): boolean {
    // Check if moving in the given direction stays within the same parent
    switch (direction) {
      case Direction.PosX:
        return (octant & 1) === 0; // x bit is 0
      case Direction.NegX:
        return (octant & 1) === 1; // x bit is 1
      case Direction.PosY:
        return (octant & 2) === 0; // y bit is 0
      case Direction.NegY:
        return (octant & 2) === 2; // y bit is 1
      case Direction.PosZ:
        return (octant & 4) === 0; // z bit is 0
      case Direction.NegZ:
        return (octant & 4) === 4; // z bit is 1
    }
  }

  private isAtBoundary(direction: Direction): boolean {
    if (!this.parent) {
      return true;
    }

    const parentSize = this.parent.size;
    const parentCenter = this.parent.center;

    switch (direction) {
      case Direction.PosX:
        return this.center.x + this.size/2 >= parentCenter.x + parentSize/2;
      case Direction.NegX:
        return this.center.x - this.size/2 <= parentCenter.x - parentSize/2;
      case Direction.PosY:
        return this.center.y + this.size/2 >= parentCenter.y + parentSize/2;
      case Direction.NegY:
        return this.center.y - this.size/2 <= parentCenter.y - parentSize/2;
      case Direction.PosZ:
        return this.center.z + this.size/2 >= parentCenter.z + parentSize/2;
      case Direction.NegZ:
        return this.center.z - this.size/2 <= parentCenter.z - parentSize/2;
    }
  }

  getNeighborAtLevel(direction: Direction): OctreeNode | null {
    // If at root, handle boundary case
    if (!this.parent) {
      return null;
    }

    // Get our octant index in parent
    const myOctant = this.octant;

    // If we're at a boundary in this direction, need to go up
    if (this.isAtBoundary(direction)) {
      const parentNeighbor = this.parent.getNeighborAtLevel(direction);
      if (!parentNeighbor) {
        // Create virtual outside node at boundary
        const directionVector = new THREE.Vector3();
        switch (direction) {
          case Direction.PosX: directionVector.set(1, 0, 0); break;
          case Direction.NegX: directionVector.set(-1, 0, 0); break;
          case Direction.PosY: directionVector.set(0, 1, 0); break;
          case Direction.NegY: directionVector.set(0, -1, 0); break;
          case Direction.PosZ: directionVector.set(0, 0, 1); break;
          case Direction.NegZ: directionVector.set(0, 0, -1); break;
        }
        const virtualCenter = new THREE.Vector3()
          .copy(this.center)
          .addScaledVector(directionVector, this.size);
        return new OctreeNode(virtualCenter, this.size, this.sdf);
      }
      
      // Get the mirror octant in the neighbor
      const neighborOctant = this.getMirrorOctant(myOctant, direction);
      return parentNeighbor.children[neighborOctant] || parentNeighbor;
    }

    // If neighbor is in same parent, just return sibling
    if (this.isNeighborInSameParent(myOctant, direction)) {
      const neighborOctant = this.getNeighborOctant(myOctant, direction);
      return this.parent.children[neighborOctant];
    }

    // Otherwise get parent's neighbor and traverse down
    const parentNeighbor = this.parent.getNeighborAtLevel(direction);
    if (!parentNeighbor) {
      return null;
    }

    // Return appropriate child of parent's neighbor
    const targetOctant = this.getMirrorOctant(myOctant, direction);
    return parentNeighbor.children[targetOctant] || parentNeighbor;
  }

  // Vector3 interface delegates to enum-based version
  getNeighbor(direction: THREE.Vector3): OctreeNode | null {
    return this.getNeighborAtLevel(vectorToDirection(direction));
  }

  evaluate(): Interval {
    // Evaluate SDF over the cube bounds
    const half = this.size / 2;
    const context: Record<string, Interval> = {
      x: new Interval(this.center.x - half, this.center.x + half),
      y: new Interval(this.center.y - half, this.center.y + half),
      z: new Interval(this.center.z - half, this.center.z + half)
    };
    return this.sdf.evaluateInterval(context);
  }

  evaluatePoint(point: THREE.Vector3): number {
    const context: Record<string, number> = {
      x: point.x,
      y: point.y,
      z: point.z
    };
    return this.sdf.evaluate(context);
  }

  evaluateGradient(point: THREE.Vector3): THREE.Vector3 {
    const h = 0.0001; // Small delta for finite differences
    const dx = (this.evaluatePoint(new THREE.Vector3(point.x + h, point.y, point.z)) -
               this.evaluatePoint(new THREE.Vector3(point.x - h, point.y, point.z))) / (2 * h);
    const dy = (this.evaluatePoint(new THREE.Vector3(point.x, point.y + h, point.z)) -
               this.evaluatePoint(new THREE.Vector3(point.x, point.y - h, point.z))) / (2 * h);
    const dz = (this.evaluatePoint(new THREE.Vector3(point.x, point.y, point.z + h)) -
               this.evaluatePoint(new THREE.Vector3(point.x, point.y, point.z - h))) / (2 * h);
    return new THREE.Vector3(dx, dy, dz).normalize();
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

  subdivide(
    minSize: number = 0.1, 
    cellBudget: number = 100000, 
    renderSettings?: OctreeRenderSettings,
    onProgress?: (cells: number) => void
  ): number {
    const startBudget = cellBudget;
    let totalCells = 1;
    const newSize = this.size / 2;

    // Create default settings if none provided
    const settings = renderSettings || new OctreeRenderSettings();

    // If we're not a boundary cell, stop subdividing
    if (this.state !== CellState.Boundary) {
      console.log(`Stopping subdivision: cell at ${this.center.toArray()} is not boundary (state: ${CellState[this.state]})`);
      return 1;
    }

    // If we've reached minimum size, stay as boundary cell
    if (newSize < minSize) {
      console.log(`Stopping subdivision: reached minimum size ${newSize} at ${this.center.toArray()}`);
      return 1;
    }

    // If no budget left, throw
    if (cellBudget <= 1) {
      throw new Error('Cell budget exhausted');
    }

    // Decrement budget for this cell
    cellBudget--;

    // Create 8 children
    const half = newSize;
    const offsets = [
      [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
      [-1, -1, 1],  [1, -1, 1],  [-1, 1, 1],  [1, 1, 1]
    ];

    // Mark boundary cells as subdivided before creating children
    if (this.state === CellState.Boundary) {
      this.state = CellState.BoundarySubdivided;
    }
    
    // Create 8 children with equal portion of remaining budget
    console.log(`Subdividing cell at ${this.center.toArray()} with size ${this.size}`);
    let totalChildCells = 0;
    
    for (let i = 0; i < 8; i++) {
      const [x, y, z] = offsets[i];
      const childCenter = new THREE.Vector3(
        this.center.x + x * half/2,
        this.center.y + y * half/2,
        this.center.z + z * half/2
      );
      this.children[i] = new OctreeNode(childCenter, newSize, this.sdf, this, i);
      
      // Try to subdivide child with current budget
      const child = this.children[i];
      if (!child) continue;
      
      console.log(`Processing child ${i} at ${childCenter.toArray()} with state ${CellState[child.state]}`);
      const cellsCreated = child.subdivide(minSize, cellBudget, settings);
      totalChildCells += cellsCreated;
      cellBudget -= cellsCreated;
      
      if (cellBudget <= 0) {
        console.log('Cell budget exhausted during subdivision');
        break;
      }
    }
    
    console.log(`Created ${totalChildCells} cells in children of ${this.center.toArray()}`);

    // Report progress if callback provided
    if (onProgress) {
      onProgress(totalCells);
    }

    // Return number of cells created
    return totalCells;
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
    if (this.state === CellState.Boundary || this.state === CellState.BoundarySubdivided) return 1;
    let count = 0;
    for (const child of this.children) {
      if (child) count += child.countBoundary();
    }
    return count;
  }
}
export class OctreeRenderSettings {
  constructor(
    public showOutside: boolean = true,
    public showInside: boolean = true,
    public showBoundary: boolean = true,
    public minRenderSize: number = 0.1
  ) {}
}

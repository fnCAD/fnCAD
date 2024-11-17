import { Node } from './ast';
import { Interval } from './interval';
import * as THREE from 'three';

export enum CellState {
  Inside,
  Outside,
  Boundary
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
  vertices: THREE.Vector3[] = [];
  edges: THREE.LineSegments | null = null;
  state: CellState;
  private hasGeometry: boolean = false;

  constructor(
    public center: THREE.Vector3,
    public size: number,
    private sdf: Node,
    public parent: OctreeNode | null = null,
    public octant: number = -1
  ) {
    // Compute and cache state during construction
    const interval = this.evaluate();
    if (interval.max < 0) {
      this.state = CellState.Inside;
    } else if (interval.min > 0) {
      this.state = CellState.Outside;
    } else {
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
    return this.state === CellState.Boundary;
  }

  isFullyInside(): boolean {
    return this.state === CellState.Inside;
  }

  isFullyOutside(): boolean {
    return this.state === CellState.Outside;
  }

  subdivide(minSize: number = 0.1, cellBudget: number = 100000, renderSettings?: OctreeRenderSettings): number {
    const startBudget = cellBudget;
    
    const interval = this.evaluate();

    // Create default settings if none provided
    const settings = renderSettings || new OctreeRenderSettings();

    // If the interval is entirely positive or negative, or we've reached minimum size,
    // we don't need to subdivide further
    const newSize = this.size / 2;
    if (interval.min > 0 || interval.max < 0 || newSize < minSize) {
      // Update geometry for this node
      this.updateLocalGeometry(settings);
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

    // Create 8 children with equal portion of remaining budget
    for (let i = 0; i < 8; i++) {
      const [x, y, z] = offsets[i];
      const childCenter = new THREE.Vector3(
        this.center.x + x * half/2,
        this.center.y + y * half/2,
        this.center.z + z * half/2
      );
      this.children[i] = new OctreeNode(childCenter, newSize, this.sdf, this, i);
      // Try to subdivide child with current budget
      const cellsCreated = this.children[i].subdivide(minSize, cellBudget, settings);
      cellBudget -= cellsCreated;
      if (this.children[i].hasGeometry) {
        this.hasGeometry = true;
      }
    }

    // Return number of cells created (difference between start and end budget)
    return startBudget - cellBudget;
  }

  private getColorForSize(): THREE.Color {
    // Map size to a color - red for small cells, green for large
    // Using log scale since sizes vary greatly
    const maxSize = 65536; // Our current max size
    const t = Math.log(this.size) / Math.log(maxSize); // Normalized 0-1
    
    if (this.isSurfaceCell()) {
      return new THREE.Color(1, 1, 0); // Yellow for boundary cells
    } else if (this.isFullyInside()) {
      return new THREE.Color(0, 1, 0); // Green for inside cells
    } else {
      return new THREE.Color(1, 0, 0); // Red for outside cells
    }
  }

  updateGeometry(settings: OctreeRenderSettings): void {
    this.updateLocalGeometry(settings);
    
    // Recursively update children
    this.children.forEach(child => {
      if (child) {
        child.updateGeometry(settings);
      }
    });
  }

  private updateLocalGeometry(settings: OctreeRenderSettings): void {
    // Remove existing geometry
    if (this.edges) {
      this.edges.geometry.dispose();
      this.edges.material.dispose();
      this.edges = null;
      this.hasGeometry = false;
    }
    
    // Only create geometry if cell is large enough and matches visibility criteria
    if (this.size >= settings.minRenderSize) {
      if ((this.isSurfaceCell() && settings.showBoundary) ||
          (this.isFullyInside() && settings.showInside) ||
          (this.isFullyOutside() && settings.showOutside)) {
        this.createEdges();
      }
    }
  }

  private createEdges(): void {
    const half = this.size / 2;
    // Create vertices for cube corners
    const corners = [
      [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
      [-1, -1, 1],  [1, -1, 1],  [-1, 1, 1],  [1, 1, 1]
    ];
    
    this.vertices = corners.map(([x, y, z]) => 
      new THREE.Vector3(
        this.center.x + x * half,
        this.center.y + y * half,
        this.center.z + z * half
      )
    );

    // Create edges
    const geometry = new THREE.BufferGeometry();
    const edges = [
      [0,1], [1,3], [3,2], [2,0],  // Bottom face
      [4,5], [5,7], [7,6], [6,4],  // Top face
      [0,4], [1,5], [2,6], [3,7]   // Vertical edges
    ];
    
    const positions: number[] = [];
    edges.forEach(([a, b]) => {
      positions.push(
        this.vertices[a].x, this.vertices[a].y, this.vertices[a].z,
        this.vertices[b].x, this.vertices[b].y, this.vertices[b].z
      );
    });

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ 
      color: this.getColorForSize(),
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,  // Make lines add up where they overlap
      depthWrite: true,   // Write to depth buffer
      depthTest: true     // And test against it
    });
    this.edges = new THREE.LineSegments(geometry, material);
    this.hasGeometry = true;
  }

  addToScene(scene: THREE.Scene): void {
    if (!this.hasGeometry) {
      return;
    }
    
    if (this.edges) {
      scene.add(this.edges);
    }
    this.children.forEach(child => child?.addToScene(scene));
  }

  removeFromScene(scene: THREE.Scene): void {
    if (!this.hasGeometry) {
      return;
    }
    
    if (this.edges) {
      scene.remove(this.edges);
    }
    this.children.forEach(child => child?.removeFromScene(scene));
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

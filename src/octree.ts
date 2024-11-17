import { Node } from './ast';
import { Interval } from './interval';
import * as THREE from 'three';

export enum CellState {
  Inside,
  Outside,
  Boundary
}

export class OctreeNode {
  children: (OctreeNode | null)[] = new Array(8).fill(null);
  vertices: THREE.Vector3[] = [];
  edges: THREE.LineSegments | null = null;
  state: CellState;

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

  getNeighbor(direction: THREE.Vector3): OctreeNode | null {
    // If we're at root, no neighbor
    if (!this.parent) return null;

    // Get relative position in parent's octants
    const parentSize = this.size * 2;
    const relativePos = new THREE.Vector3()
      .copy(this.center)
      .sub(this.parent.center)
      .divideScalar(this.size);

    // Calculate target position
    const targetPos = new THREE.Vector3()
      .copy(relativePos)
      .add(direction);

    // If target is within parent's bounds, traverse down
    if (Math.abs(targetPos.x) <= 1 && 
        Math.abs(targetPos.y) <= 1 && 
        Math.abs(targetPos.z) <= 1) {
      // Find target octant in parent
      const tx = targetPos.x > 0 ? 1 : 0;
      const ty = targetPos.y > 0 ? 1 : 0;
      const tz = targetPos.z > 0 ? 1 : 0;
      const targetOctant = tx + ty * 2 + tz * 4;
      return this.parent.children[targetOctant];
    }

    // Otherwise need to go up and over
    const parentNeighbor = this.parent.getNeighbor(direction);
    if (!parentNeighbor) return null;

    // Find corresponding child in the neighbor
    const tx = relativePos.x * direction.x < 0 ? 1 : 0;
    const ty = relativePos.y * direction.y < 0 ? 1 : 0;
    const tz = relativePos.z * direction.z < 0 ? 1 : 0;
    const targetOctant = tx + ty * 2 + tz * 4;
    return parentNeighbor.children[targetOctant];
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

  subdivide(minSize: number = 0.1, cellBudget: number = 100000): number {
    const startBudget = cellBudget;
    
    const interval = this.evaluate();

    // If the interval is entirely positive or negative, we don't need to subdivide
    if (interval.min > 0 || interval.max < 0) {
      this.createEdges();
      return 1;
    }

    // If we've reached minimum size, stop subdividing
    const newSize = this.size / 2;
    if (newSize < minSize) {
      this.createEdges();
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
      cellBudget -= this.children[i].subdivide(minSize, cellBudget);
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

  updateVisibility(showOutside: boolean, showInside: boolean, showBoundary: boolean): void {
    if (this.edges) {
      if (this.isSurfaceCell()) {
        this.edges.visible = showBoundary;
      } else if (this.isFullyInside()) {
        this.edges.visible = showInside;
      } else {
        this.edges.visible = showOutside;
      }
    }
    
    this.children.forEach(child => {
      if (child) {
        child.updateVisibility(showOutside, showInside, showBoundary);
      }
    });
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
  }

  addToScene(scene: THREE.Scene): void {
    if (this.edges) {
      scene.add(this.edges);
    }
    this.children.forEach(child => child?.addToScene(scene));
  }

  removeFromScene(scene: THREE.Scene): void {
    if (this.edges) {
      scene.remove(this.edges);
    }
    this.children.forEach(child => child?.removeFromScene(scene));
  }

}

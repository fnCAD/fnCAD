import { Node } from './ast';
import { Interval } from './interval';
import * as THREE from 'three';

export class OctreeNode {
  children: (OctreeNode | null)[] = new Array(8).fill(null);
  vertices: THREE.Vector3[] = [];
  edges: THREE.LineSegments | null = null;

  constructor(
    public center: THREE.Vector3,
    public size: number,
    private sdf: Node
  ) {}

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

  subdivide(minSize: number = 0.1): void {
    const interval = this.evaluate();

    // If the interval is entirely positive or negative, we don't need to subdivide
    if (interval.min > 0 || interval.max < 0) {
      this.createEdges();
      return;
    }

    // If we've reached minimum size, stop subdividing
    const newSize = this.size / 2;
    if (newSize < minSize) {
      this.createEdges();
      return;
    }

    // Create 8 children
    const half = newSize;
    const offsets = [
      [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
      [-1, -1, 1],  [1, -1, 1],  [-1, 1, 1],  [1, 1, 1]
    ];

    for (let i = 0; i < 8; i++) {
      const [x, y, z] = offsets[i];
      const childCenter = new THREE.Vector3(
        this.center.x + x * half/2,
        this.center.y + y * half/2,
        this.center.z + z * half/2
      );
      this.children[i] = new OctreeNode(childCenter, newSize, this.sdf);
      this.children[i].subdivide(minSize);
    }
  }

  private getColorForSize(): THREE.Color {
    // Map size to a color - red for small cells, green for large
    // Using log scale since sizes vary greatly
    const maxSize = 65536; // Our current max size
    const t = Math.log(this.size) / Math.log(maxSize); // Normalized 0-1
    return new THREE.Color(1.0 - t, t, 0); // Red to Green
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

  countCells(): number {
    // Count this cell
    let count = 1;
    // Add counts from non-null children
    this.children.forEach(child => {
      if (child) count += child.countCells();
    });
    return count;
  }
}

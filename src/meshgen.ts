import * as THREE from 'three';
import { OctreeNode, Direction, CellState } from './octree';

export class MeshGenerator {
    private vertices: THREE.Vector3[] = [];
    private faces: number[] = [];
    onProgress?: (progress: number) => void;
    
    constructor(private octree: OctreeNode, private optimize: boolean = true) {}

    private reportProgress(progress: number) {
        if (this.onProgress) {
            this.onProgress(Math.min(1, Math.max(0, progress)));
        }
    }

    generate(): THREE.Mesh {
        // Phase 1: Collect surface cells (0-40%)
        this.reportProgress(0);
        this.collectSurfaceCells(this.octree);
        this.reportProgress(0.4);

        // Phase 2: Create initial mesh (40-60%)
        const mesh = this.createMesh();
        this.reportProgress(0.6);

        // Phase 3: Optimize if enabled (60-100%)
        if (this.optimize) {
            this.optimizeVertices(true);
            this.reportProgress(1.0);
        } else {
            this.reportProgress(1.0);
        }

        return mesh;
    }

    private collectSurfaceCells(node: OctreeNode) {
        // Check if this is a boundary cell (either leaf or subdivided)
        if (node.state === CellState.Boundary || node.state === CellState.BoundarySubdivided) {
            // Add vertices for leaf nodes or nodes at minimum size
            const isLeaf = node.children.every(child => child === null);
            if (isLeaf || node.state === CellState.Boundary) {
                this.addCellVertices(node);
                return;
            }
        }

        // Recurse into children for subdivided nodes
        node.children.forEach(child => {
            if (child) {
                this.collectSurfaceCells(child);
            }
        });
    }

    private addCellVertices(node: OctreeNode) {
        // Get existing vertices or create new ones
        const startIndex = this.vertices.length;
        
        // Add vertices for this cell
        const half = node.size / 2;
        const corners = [
            [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
            [-1, -1, 1],  [1, -1, 1],  [-1, 1, 1],  [1, 1, 1]
        ];
        
        corners.forEach(([x, y, z]) => {
            this.vertices.push(new THREE.Vector3(
                node.center.x + x * half,
                node.center.y + y * half,
                node.center.z + z * half
            ));
        });

        // Define faces and their normal directions
        const faces = [
            // Front (negative Z)
            { indices: [0, 1, 2, 2, 1, 3], normal: new THREE.Vector3(0, 0, -1) },
            // Back (positive Z)
            { indices: [4, 6, 5, 5, 6, 7], normal: new THREE.Vector3(0, 0, 1) },
            // Left (negative X)
            { indices: [0, 2, 4, 4, 2, 6], normal: new THREE.Vector3(-1, 0, 0) },
            // Right (positive X)
            { indices: [1, 5, 3, 3, 5, 7], normal: new THREE.Vector3(1, 0, 0) },
            // Top (positive Y)
            { indices: [2, 3, 6, 6, 3, 7], normal: new THREE.Vector3(0, 1, 0) },
            // Bottom (negative Y)
            { indices: [0, 4, 1, 1, 4, 5], normal: new THREE.Vector3(0, -1, 0) }
        ];

        // Check each face's neighboring cell before adding it
        faces.forEach(face => {
            // Convert face normal to Direction enum
            let direction: Direction;
            if (face.normal.x > 0) direction = Direction.PosX;
            else if (face.normal.x < 0) direction = Direction.NegX;
            else if (face.normal.y > 0) direction = Direction.PosY;
            else if (face.normal.y < 0) direction = Direction.NegY;
            else if (face.normal.z > 0) direction = Direction.PosZ;
            else direction = Direction.NegZ;

            // Get neighbor using enum-based method
            const neighbor = node.getNeighborAtLevel(direction);
            if (!neighbor) {
                throw new Error(`Missing neighbor cell in octree for node at ${node.center.toArray()} with size ${node.size}, face normal ${face.normal.toArray()}`);
            } else {
                // Add face if the neighbor is outside or at a coarser level
                if (neighbor.isFullyOutside() || 
                    (neighbor.state === CellState.Outside && neighbor.size > node.size)) {
                    face.indices.forEach(idx => {
                        this.faces.push(startIndex + idx);
                    });
                }
            }
        });
    }

    private optimizeVertices(optimize: boolean = true) {
        if (!optimize) {
            return;
        }

        const maxIterations = 10;
        const epsilon = 0.0001;
        
        for (let iter = 0; iter < maxIterations; iter++) {
            let maxMove = 0;
            // Report progress within optimization phase (60-100%)
            this.reportProgress(0.6 + (iter / maxIterations) * 0.4);
            
            for (let i = 0; i < this.vertices.length; i++) {
                const vertex = this.vertices[i];
                const distance = this.octree.evaluatePoint(vertex);
                const gradient = this.octree.evaluateGradient(vertex);
                
                // Move vertex along gradient to surface
                const move = -distance;
                vertex.addScaledVector(gradient, move);
                
                maxMove = Math.max(maxMove, Math.abs(move));
            }
            
            // Stop if vertices barely moved
            if (maxMove < epsilon) {
                break;
            }
        }
    }

    private createMesh(): THREE.Mesh {
        // Optimize vertex positions if enabled
        this.optimizeVertices(this.optimize);

        const geometry = new THREE.BufferGeometry();
        
        // Convert vertices to flat array
        const positions = new Float32Array(this.vertices.length * 3);
        this.vertices.forEach((vertex, i) => {
            positions[i * 3] = vertex.x;
            positions[i * 3 + 1] = vertex.y;
            positions[i * 3 + 2] = vertex.z;
        });


        // Set attributes
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setIndex(this.faces);
        
        // Compute normals
        geometry.computeVertexNormals();

        // Create mesh with basic material
        const material = new THREE.MeshPhongMaterial({
            color: 0xffd700,
            side: THREE.DoubleSide,
            flatShading: true,
            emissive: 0x222222,
            shininess: 30,
            transparent: true,
            opacity: 0.8,
            depthWrite: true,
            depthTest: true
        });

        const mesh = new THREE.Mesh(geometry, material);
        return mesh;
    }
}

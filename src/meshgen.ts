import * as THREE from 'three';
import { SerializedMesh } from './workers/mesh_types';
import { OctreeNode, Direction, CellState } from './octree';

/**
 * Generates a triangle mesh from an octree representation of an SDF boundary.
 * 
 * IMPORTANT MESH GENERATION INVARIANT:
 * The octree subdivision algorithm ensures that all boundary cells (CellState.Boundary)
 * are at the same scale/level. This is because:
 * 
 * 1. The subdivision process continues until either:
 *    - The minimum size is reached
 *    - The cell budget is exhausted
 *    - The cell is fully inside/outside
 * 
 * 2. For any given SDF, a cell can only be classified as boundary if:
 *    - It contains the zero isosurface (interval spans zero)
 *    - It hasn't reached the minimum size
 *    - There's remaining cell budget
 * 
 * 3. Since boundary detection uses interval arithmetic, any cell containing
 *    the surface will be marked for subdivision until these limits are hit.
 * 
 * This invariant guarantees that adjacent boundary cells are always the same size,
 * which in turn ensures that the generated mesh is manifold when using the
 * simple "two triangles per face" extraction method. Without this guarantee,
 * we could get T-junctions or gaps where cells of different sizes meet.
 * 
 * Note: Cell budget exhaustion is treated as an error condition that halts
 * subdivision entirely, rather than allowing partial subdivision that could
 * violate this invariant. This ensures we never generate invalid meshes,
 * even when resource limits are hit.
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
    private vertices: THREE.Vector3[] = [];
    private faces: number[] = [];
    private faceQualities: number[] = [];
    onProgress?: (progress: number) => void;
    
    constructor(
        private octree: OctreeNode, 
        private sdf: import('./sdf_expressions/ast').Node,
        private optimize: boolean = true,
        private showQuality: boolean = false,
        private qualityThreshold: number = 0.1
    ) {}

    private reportProgress(progress: number) {
        if (this.onProgress) {
            this.onProgress(Math.min(1, Math.max(0, progress)));
        }
    }

    generate(): SerializedMesh {
        // Phase 1: Collect surface cells (0-40%)
        this.reportProgress(0);
        this.collectSurfaceCells(this.octree);
        this.reportProgress(0.4);

        // TODO check for half-edge mesh manifoldness here

        // Phase 2: Optimize if enabled (40-80%)
        if (this.optimize) {
            this.optimizeVertices(true);
            this.reportProgress(0.8);
        }

        // Phase 3: Calculate face qualities (80-90%)
        if (this.showQuality) {
            this.calculateFaceQualities();
        }
        this.reportProgress(0.9);

        // Phase 4: Create final mesh data (90-100%)
        const positions = new Float32Array(this.vertices.length * 3);
        const colors = new Float32Array(this.vertices.length * 3);
        
        this.vertices.forEach((vertex, i) => {
            positions[i * 3] = vertex.x;
            positions[i * 3 + 1] = vertex.y;
            positions[i * 3 + 2] = vertex.z;
        });

        // Set face colors based on qualities
        const faceColors = this.showQuality ? new Float32Array(this.faces.length) : undefined;
        if (this.showQuality && faceColors) {
            for (let i = 0; i < this.faceQualities.length; i++) {
                const color = this.getQualityColor(this.faceQualities[i]);
                faceColors[i * 3] = color.r;
                faceColors[i * 3 + 1] = color.g;
                faceColors[i * 3 + 2] = color.b;
            }
        }

        this.reportProgress(1.0);

        return {
            vertices: Array.from(positions),
            indices: Array.from(this.faces),
            faceColors: this.showQuality ? Array.from(faceColors!) : undefined
        };
    }

    private calculateFaceQualities() {
        this.faceQualities = [];
        
        // Process each face
        for (let i = 0; i < this.faces.length; i += 3) {
            const indices = [
                this.faces[i],
                this.faces[i + 1],
                this.faces[i + 2]
            ];
            
            // Get vertices
            const vertices = indices.map(idx => this.vertices[idx]);
            
            // Calculate face centroid
            const centroid = new THREE.Vector3()
                .add(vertices[0])
                .add(vertices[1])
                .add(vertices[2])
                .multiplyScalar(1/3);
            
            // Evaluate SDF at centroid
            const actualSDF = this.sdf.evaluate({
                x: centroid.x,
                y: centroid.y,
                z: centroid.z
            });

            // Calculate edge lengths
            const edges = [
                vertices[1].clone().sub(vertices[0]),
                vertices[2].clone().sub(vertices[1]),
                vertices[0].clone().sub(vertices[2])
            ];
            const maxEdgeLength = Math.max(...edges.map(e => e.length()));

            // Calculate quality metric - just use absolute SDF value at centroid
            // normalized by max edge length
            const quality = Math.abs(actualSDF) / maxEdgeLength;

            this.faceQualities.push(quality);
        }
    }

    private getQualityColor(quality: number): THREE.Color {
        // Red for poor quality (> threshold)
        // Green for good quality (< threshold)
        const t = Math.min(quality / this.qualityThreshold, 1);
        return new THREE.Color(t, 1 - t, 0);
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

    private addCellVertices(node: OctreeNode, mesh: HalfEdgeMesh) {
        const half = node.size / 2;
        const corners = [
            [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
            [-1, -1, 1],  [1, -1, 1],  [-1, 1, 1],  [1, 1, 1]
        ];
        
        // Add vertices and store their indices
        const vertexIndices = corners.map(([x, y, z]) => 
            mesh.addVertex(new THREE.Vector3(
                node.center.x + x * half,
                node.center.y + y * half,
                node.center.z + z * half
            ))
        );

        // Define faces with their normal directions
        const faces = [
            // Front (negative Z)
            { vertices: [0, 1, 2, 2, 1, 3], normal: new THREE.Vector3(0, 0, -1) },
            // Back (positive Z)
            { vertices: [4, 6, 5, 5, 6, 7], normal: new THREE.Vector3(0, 0, 1) },
            // Left (negative X)
            { vertices: [0, 2, 4, 4, 2, 6], normal: new THREE.Vector3(-1, 0, 0) },
            // Right (positive X)
            { vertices: [1, 5, 3, 3, 5, 7], normal: new THREE.Vector3(1, 0, 0) },
            // Top (positive Y)
            { vertices: [2, 3, 6, 6, 3, 7], normal: new THREE.Vector3(0, 1, 0) },
            // Bottom (negative Y)
            { vertices: [0, 4, 1, 1, 4, 5], normal: new THREE.Vector3(0, -1, 0) }
        ];

        // Add faces checking neighbors
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
                throw new Error(`Missing neighbor cell in octree for node at ${node.center.toArray()} with size ${node.size}`);
            } else {
                // Add face if the neighbor is outside or at a coarser level
                if (neighbor.isFullyOutside() || 
                    (neighbor.state === CellState.Outside && neighbor.size > node.size)) {
                    // Add two triangles for this quad face
                    mesh.addFace(
                        vertexIndices[face.vertices[0]],
                        vertexIndices[face.vertices[1]],
                        vertexIndices[face.vertices[2]]
                    );
                    mesh.addFace(
                        vertexIndices[face.vertices[3]],
                        vertexIndices[face.vertices[4]],
                        vertexIndices[face.vertices[5]]
                    );
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
                // Get the SDF from the constructor
                if (!this.sdf) {
                    throw new Error('No SDF available for mesh optimization');
                }
                
                // Evaluate SDF at vertex position
                const distance = this.sdf.evaluate({
                    x: vertex.x,
                    y: vertex.y,
                    z: vertex.z
                });

                // Calculate gradient using finite differences
                const h = 0.0001; // Small offset for gradient calculation
                const gradient = new THREE.Vector3(
                    (this.sdf.evaluate({x: vertex.x + h, y: vertex.y, z: vertex.z}) - 
                     this.sdf.evaluate({x: vertex.x - h, y: vertex.y, z: vertex.z})) / (2 * h),
                    (this.sdf.evaluate({x: vertex.x, y: vertex.y + h, z: vertex.z}) - 
                     this.sdf.evaluate({x: vertex.x, y: vertex.y - h, z: vertex.z})) / (2 * h),
                    (this.sdf.evaluate({x: vertex.x, y: vertex.y, z: vertex.z + h}) - 
                     this.sdf.evaluate({x: vertex.x, y: vertex.y, z: vertex.z - h})) / (2 * h)
                );
                gradient.normalize();
                
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

}

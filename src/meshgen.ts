import * as THREE from 'three';
import { SerializedMesh } from './workers/mesh_types';
import { HalfEdgeMesh } from './halfedge';
import { OctreeNode, Direction, CellState } from './octree';

/**
 * Generates a triangle mesh from an octree representation of an SDF 
 * boundary. Uses a half-edge mesh data structure for robust topology handling.
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
    onProgress?: (progress: number) => void;

    constructor(
        private octree: OctreeNode,
        private sdf: import('./sdf_expressions/ast').Node,
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
        
        // Phase 1: Extract surface mesh from octree (0-50%)
        this.reportProgress(0);
        this.extractMeshFromOctree(this.octree, mesh);
        this.reportProgress(0.5);

        // Phase 2: Optimize vertices if enabled (50-55%)
        if (this.optimize) {
            mesh.refineEdges((pos) => this.sdf.evaluate({
                x: pos.x,
                y: pos.y,
                z: pos.z
            }), {
                errorThreshold: minSize / 100.0,
                maxSubdivisions: mesh.halfEdges.length,
                minEdgeLength: minSize / 100.0
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

    private extractMeshFromOctree(node: OctreeNode, mesh: HalfEdgeMesh) {
        // Check if this is a boundary cell
        if (node.state === CellState.Boundary || node.state === CellState.BoundarySubdivided) {
            // Only process leaf nodes
            const isLeaf = node.children.every(child => child === null);
            if (isLeaf || node.state === CellState.Boundary) {
                this.addCellFaces(node, mesh);
                return;
            }
        }

        // Recurse into children for subdivided nodes
        node.children.forEach(child => {
            if (child) {
                this.extractMeshFromOctree(child, mesh);
            }
        });
    }

    // Cache to reuse vertices at shared corners
    private vertexCache = new Map<string, number>();

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

    private addCellFaces(node: OctreeNode, mesh: HalfEdgeMesh) {
        const half = node.size / 2;
        const corners = [
            [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
            [-1, -1, 1],  [1, -1, 1],  [-1, 1, 1],  [1, 1, 1]
        ];
        
        // Add vertices with caching
        const vertexIndices = corners.map(([x, y, z]) => {
            const pos = new THREE.Vector3(
                node.center.x + x * half,
                node.center.y + y * half,
                node.center.z + z * half
            );
            return this.getVertexIndex(pos, mesh);
        });

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
}

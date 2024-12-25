import * as THREE from 'three';
import { SerializedMesh } from './workers/mesh_types';
import { HalfEdgeMesh } from './halfedge';
import { OctreeNode, Direction, CellState, octreeChildCenter } from './octree';

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
        this.extractMeshFromOctree(this.octree, mesh, new THREE.Vector3(0, 0, 0), 65536);
        this.reportProgress(0.5);

        // Phase 2: Optimize vertices if enabled (50-55%)
        if (this.optimize) {
            mesh.refineEdges((pos) => this.sdf.evaluate(pos), {
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

    private extractMeshFromOctree(node: OctreeNode, mesh: HalfEdgeMesh, center: THREE.Vector3, size: number) {
        // Check if this is a boundary cell
        if (node.state === CellState.Boundary || node.state === CellState.BoundarySubdivided) {
            // Only process leaf nodes
            const isLeaf = node.children.every(child => child === null);
            if (isLeaf || node.state === CellState.Boundary) {
                this.addCellFaces(node, mesh, center, size);
                return;
            }
        }

        // Recurse into children for subdivided nodes
        const half = size / 2;
        node.children.forEach((child, index) => {
            if (child) {
                this.extractMeshFromOctree(child, mesh, octreeChildCenter(index, center, half), half);
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

    private addCellFaces(node: OctreeNode, mesh: HalfEdgeMesh, center: THREE.Vector3, size: number) {
        const half = size / 2;
        const corners = [
            [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
            [-1, -1, 1],  [1, -1, 1],  [-1, 1, 1],  [1, 1, 1]
        ];

        const self = this;
        function vertexIndex(corner: number): number {
            const [x, y, z] = corners[corner];
            const pos = new THREE.Vector3(
                center.x + x * half,
                center.y + y * half,
                center.z + z * half
            );
            return self.getVertexIndex(pos, mesh);
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
        faces.forEach(face => {
            const neighbor = node.getNeighborAtLevel(face.direction);
            
            this.considerNeighborFace(neighbor, face.vertices.map((a) => vertexIndex(a)), size, face.direction, mesh);
        });
    }

    private considerNeighborFace(
        neighbor: OctreeNode | null,
        vertices: number[],
        size: number,
        direction: Direction,
        mesh: HalfEdgeMesh)
    {
        if (!neighbor || neighbor.state === CellState.Outside) {
            // Add two triangles for this quad face
            mesh.addFace(vertices[0], vertices[1], vertices[2]);
            mesh.addFace(vertices[2], vertices[1], vertices[3]);
        } else if (neighbor.state === CellState.BoundarySubdivided) {
            this.addSubdividedFace(neighbor, vertices, size, direction, mesh);
        }
    }

    private addSubdividedFace(
        neighbor: OctreeNode,
        vertices: number[],
        size: number,
        direction: Direction,
        mesh: HalfEdgeMesh
    ) {
        const childIndices = this.getAdjacentChildIndices(direction);

        // For each quadrant of the face
        for (let i = 0; i < 4; i++) {
            const childNeighbor = neighbor.children[childIndices[i]];
            const quadVertices = this.getQuadrantVertices(vertices, i, mesh);

            this.considerNeighborFace(childNeighbor, quadVertices, size / 2, direction, mesh);
        }
    }

    private getAdjacentChildIndices(direction: Direction): number[] {
        switch (direction) {
            case Direction.PosX: return [1, 3, 5, 7];
            case Direction.NegX: return [0, 2, 4, 6];
            case Direction.PosY: return [2, 3, 6, 7];
            case Direction.NegY: return [0, 1, 4, 5];
            case Direction.PosZ: return [4, 5, 6, 7];
            case Direction.NegZ: return [0, 1, 2, 3];
        }
    }

    private getQuadrantVertices(faceVertices: number[], quadrant: number, mesh: HalfEdgeMesh): number[] {
        // Calculate vertices for each quadrant of the face
        const quadrantOffsets = [
            [0, 0], // Bottom left
            [1, 0], // Bottom right
            [0, 1], // Top left
            [1, 1]  // Top right
        ];

        const [x, y] = quadrantOffsets[quadrant];

        // Add vertices for the quadrant's triangles
        // half-steps in each direction
        const dx = mesh.vertices[faceVertices[1]].position.clone().sub(mesh.vertices[faceVertices[0]].position);
        const dy = mesh.vertices[faceVertices[2]].position.clone().sub(mesh.vertices[faceVertices[0]].position);
        const hdx = dx.clone().divideScalar(2);
        const hdy = dy.clone().divideScalar(2);
        const base = mesh.vertices[faceVertices[0]].position.clone();
        if (x == 1) base.add(hdx);
        if (y == 1) base.add(hdy);
        return [
            this.getVertexIndex(base, mesh),
            this.getVertexIndex(base.clone().add(hdx), mesh),
            this.getVertexIndex(base.clone().add(hdy), mesh),
            this.getVertexIndex(base.clone().add(hdx).add(hdy), mesh),
        ];
    }
}

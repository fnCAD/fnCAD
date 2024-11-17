import * as THREE from 'three';
import { OctreeNode } from './octree';

export class MeshGenerator {
    private vertices: THREE.Vector3[] = [];
    private faces: number[] = [];
    
    constructor(private octree: OctreeNode) {}

    generate(): THREE.Mesh {
        console.log('Starting mesh generation');
        this.collectSurfaceCells(this.octree);
        console.log(`Collected ${this.vertices.length} vertices and ${this.faces.length} face indices`);
        const mesh = this.createMesh();
        console.log('Mesh generation complete');
        return mesh;
    }

    private collectSurfaceCells(node: OctreeNode) {
        console.log(`Checking node at ${node.center.toArray()} with size ${node.size}`);
        
        if (!node.isSurfaceCell()) {
            console.log('Not a surface cell, skipping');
            return;
        }

        // If this is a leaf node or small enough, add its vertices
        if (node.children.every(child => child === null) || node.size < 0.2) {
            console.log('Adding vertices for surface cell');
            this.addCellVertices(node);
            return;
        }

        // Otherwise recurse into children
        console.log('Recursing into children');
        node.children.forEach((child, index) => {
            if (child) {
                console.log(`Processing child ${index}`);
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

        // Add faces (triangles) for the cube
        const faces = [
            // Front
            0, 1, 2,  2, 1, 3,
            // Back
            4, 6, 5,  5, 6, 7,
            // Left
            0, 2, 4,  4, 2, 6,
            // Right
            1, 5, 3,  3, 5, 7,
            // Top
            2, 3, 6,  6, 3, 7,
            // Bottom
            0, 4, 1,  1, 4, 5
        ];

        // Add faces with correct vertex indices
        faces.forEach(idx => {
            this.faces.push(startIndex + idx);
        });
    }

    private createMesh(): THREE.Mesh {
        console.log('Creating mesh from:', {
            vertexCount: this.vertices.length,
            faceCount: this.faces.length / 3
        });

        const geometry = new THREE.BufferGeometry();
        
        // Convert vertices to flat array
        const positions = new Float32Array(this.vertices.length * 3);
        this.vertices.forEach((vertex, i) => {
            positions[i * 3] = vertex.x;
            positions[i * 3 + 1] = vertex.y;
            positions[i * 3 + 2] = vertex.z;
        });

        console.log('First few vertices:', 
            this.vertices.slice(0, 3).map(v => `(${v.x}, ${v.y}, ${v.z})`));
        console.log('First few faces:', 
            this.faces.slice(0, 9).join(', '));

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
        console.log('Created mesh:', mesh);
        return mesh;
    }
}

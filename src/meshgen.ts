import * as THREE from 'three';
import { OctreeNode } from './octree';

export class MeshGenerator {
    private vertices: THREE.Vector3[] = [];
    private faces: number[] = [];
    
    constructor(private octree: OctreeNode) {}

    generate(): THREE.Mesh {
        this.collectSurfaceCells(this.octree);
        const mesh = this.createMesh();
        return mesh;
    }

    private collectSurfaceCells(node: OctreeNode) {
        if (!node.isSurfaceCell()) {
            return;
        }

        // Only add vertices for leaf nodes (no children) or nodes at minimum size
        const isLeaf = node.children.every(child => child === null);
        const hasSubdividedChildren = node.children.some(child => child?.children.some(c => c !== null));
        
        if (isLeaf || !hasSubdividedChildren) {
            this.addCellVertices(node);
            return;
        }

        // Otherwise recurse into children
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
            const neighborCenter = new THREE.Vector3()
                .copy(node.center)
                .addScaledVector(face.normal, node.size);
            
            // Create a temporary node to evaluate the neighbor's space
            const neighborNode = new OctreeNode(neighborCenter, node.size, node.sdf);
            
            // Get neighbor from octree - there should always be one in our volume
            console.log(`Finding neighbor for face with normal ${face.normal.toArray()} at position ${node.center.toArray()} with size ${node.size}`);
            const neighbor = node.getNeighbor(face.normal);
            if (!neighbor) {
                console.log(`No neighbor found for face with normal ${face.normal.toArray()}`);
                // If we're at the boundary of our volume, add the face
                face.indices.forEach(idx => {
                    this.faces.push(startIndex + idx);
                });
            } else {
                console.log(`Found neighbor at ${neighbor.center.toArray()} with size ${neighbor.size}`);
                
                // Only add face if the neighbor is fully outside
                if (neighbor.isFullyOutside()) {
                    face.indices.forEach(idx => {
                        this.faces.push(startIndex + idx);
                    });
                }
            }
    }

    private optimizeVertices() {
        const maxIterations = 10;
        const epsilon = 0.0001;
        
        for (let iter = 0; iter < maxIterations; iter++) {
            let maxMove = 0;
            
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
            console.log(`Iteration ${iter + 1}, max movement: ${maxMove}`);
            if (maxMove < epsilon) {
                console.log(`Optimization converged after ${iter + 1} iterations`);
                break;
            }
        }
    }

    private createMesh(): THREE.Mesh {

        // Optimize vertex positions
        this.optimizeVertices();

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

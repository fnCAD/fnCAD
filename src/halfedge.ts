import * as THREE from 'three';

export interface Vertex {
    position: THREE.Vector3;
}

export interface HalfEdge {
    vertexIndex: number;    // Index of vertex this points TO
    faceIndex: number;      // Face this half-edge belongs to
    nextIndex: number;      // Next half-edge in face loop
    pairIndex: number;      // Opposite half-edge
}

export interface Face {
    halfEdgeIndex: number;  // Any half-edge of this face
    quality: number;        // Face quality metric
}

export class HalfEdgeMesh {
    vertices: Vertex[] = [];
    halfEdges: HalfEdge[] = [];
    faces: Face[] = [];

    // Convert from indexed format
    static fromIndexed(positions: number[], indices: number[]): HalfEdgeMesh {
        const mesh = new HalfEdgeMesh();
        
        // Create vertices
        for (let i = 0; i < positions.length; i += 3) {
            mesh.vertices.push({
                position: new THREE.Vector3(
                    positions[i],
                    positions[i + 1],
                    positions[i + 2]
                )
            });
        }

        // Create faces and half-edges
        const edgeMap = new Map<string, number>(); // vertex pair to half-edge index
        
        for (let i = 0; i < indices.length; i += 3) {
            const faceIndex = mesh.faces.length;
            
            // Create face
            const face: Face = {
                halfEdgeIndex: mesh.halfEdges.length,
                quality: 0
            };
            mesh.faces.push(face);
            
            // Create three half-edges for this face
            const v1 = indices[i];
            const v2 = indices[i + 1];
            const v3 = indices[i + 2];
            
            const he1Index = mesh.halfEdges.length;
            const he2Index = he1Index + 1;
            const he3Index = he1Index + 2;
            
            mesh.halfEdges.push(
                { vertexIndex: v2, faceIndex, nextIndex: he2Index, pairIndex: -1 },
                { vertexIndex: v3, faceIndex, nextIndex: he3Index, pairIndex: -1 },
                { vertexIndex: v1, faceIndex, nextIndex: he1Index, pairIndex: -1 }
            );
            
            // Link up pairs
            function linkPair(va: number, vb: number, heIndex: number) {
                const key = `${Math.min(va, vb)},${Math.max(va, vb)}`;
                const existing = edgeMap.get(key);
                if (existing !== undefined) {
                    mesh.halfEdges[existing].pairIndex = heIndex;
                    mesh.halfEdges[heIndex].pairIndex = existing;
                } else {
                    edgeMap.set(key, heIndex);
                }
            }
            
            linkPair(v1, v2, he1Index);
            linkPair(v2, v3, he2Index);
            linkPair(v3, v1, he3Index);
        }
        
        return mesh;
    }

    // Convert back to indexed format
    toIndexed(): { positions: number[], indices: number[] } {
        const positions: number[] = [];
        const indices: number[] = [];
        
        // Add vertices
        this.vertices.forEach(v => {
            positions.push(v.position.x, v.position.y, v.position.z);
        });
        
        // Add faces
        this.faces.forEach(face => {
            let he = this.halfEdges[face.halfEdgeIndex];
            const firstVertex = he.vertexIndex;
            he = this.halfEdges[he.nextIndex];
            const secondVertex = he.vertexIndex;
            he = this.halfEdges[he.nextIndex];
            const thirdVertex = he.vertexIndex;
            
            indices.push(firstVertex, secondVertex, thirdVertex);
        });
        
        return { positions, indices };
    }
}

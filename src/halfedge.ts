import * as THREE from 'three';
import { SerializedMesh } from './workers/mesh_types';

export interface Vertex {
    position: THREE.Vector3;
}

export interface HalfEdge {
    vertexIndex: number;    // Index of vertex this points TO
    nextIndex: number;      // Next half-edge in face loop
    pairIndex: number;      // Opposite half-edge
}

interface SplitEdges {
    tailToSplit: number;    // Edge from original tail vertex to split point
    splitToOutside: number; // Edge from split point to outside vertex
    splitToHead: number;    // Edge from split point to original head vertex
}

export class HalfEdgeMesh {
    vertices: Vertex[] = [];
    halfEdges: HalfEdge[] = [];
    private edgeMap = new Map<string, number>(); // vertex pair to half-edge index

    addVertex(position: THREE.Vector3): number {
        const idx = this.vertices.length;
        this.vertices.push({ position });
        return idx;
    }

    addFace(v1: number, v2: number, v3: number): number {
        const startIndex = this.halfEdges.length;
        
        // Create three half-edges for this face
        const he1Index = startIndex;
        const he2Index = startIndex + 1;
        const he3Index = startIndex + 2;
        
        this.halfEdges.push(
            { vertexIndex: v2, nextIndex: he2Index, pairIndex: -1 },
            { vertexIndex: v3, nextIndex: he3Index, pairIndex: -1 },
            { vertexIndex: v1, nextIndex: he1Index, pairIndex: -1 }
        );
        
        // Link up pairs
        this.linkPair(v1, v2, he1Index);
        this.linkPair(v2, v3, he2Index);
        this.linkPair(v3, v1, he3Index);

        return he1Index;
    }

    private linkPair(va: number, vb: number, heIndex: number) {
        const key = `${Math.min(va, vb)},${Math.max(va, vb)}`;
        const existing = this.edgeMap.get(key);
        if (existing !== undefined) {
            // Check if this pair was already linked
            if (this.halfEdges[existing].pairIndex !== -1) {
                throw new Error(`Edge ${va}-${vb} already has a pair`);
            }
            this.halfEdges[existing].pairIndex = heIndex;
            this.halfEdges[heIndex].pairIndex = existing;
            // Remove from map since this pair is now fully linked
            this.edgeMap.delete(key);
        } else {
            this.edgeMap.set(key, heIndex);
        }
    }

    /**
     * Splits a half-edge by inserting a new vertex.
     * Returns indices of all affected edges in the split triangle ABC,
     * where X is the new vertex inserted on edge AB.
     */
    private splitHalfEdge(indAB: number, vertexX: number): SplitEdges {
        const AB = this.halfEdges[indAB];
        if (!AB) {
            throw new Error(`No half-edge found at index ${indAB}`);
        }
        const indBC = AB.nextIndex;
        const BC = this.halfEdges[indBC];
        const indCA = BC.nextIndex;
        const CA = this.halfEdges[indCA];
        
        // Verify we have a triangle
        if (CA.nextIndex !== indAB) {
            throw new Error('Can only split edges in triangular faces');
        }

        const vertexB = AB.vertexIndex;
        const vertexC = BC.vertexIndex;
        
        // Create new half-edges
        const indXC = this.halfEdges.length;
        const indCX = indXC + 1;
        const indXB = indXC + 2;
        
        // Add new half-edges
        this.halfEdges.push(
            { vertexIndex: vertexC, nextIndex: indCA, pairIndex: indCX },
            { vertexIndex: vertexX, nextIndex: indXB, pairIndex: indXC },
            { vertexIndex: vertexB, nextIndex: indBC, pairIndex: -1 }
        );

        // AB becomes AX.
        const indAX = indAB;
        const AX = AB;
        AX.vertexIndex = vertexX;
        AX.nextIndex = indXC;
        AX.pairIndex = -1; // Filled in by caller.

        // Rewrite BC edge that belongs to the new triangle
        BC.nextIndex = indCX;

        return {
            tailToSplit: indAX,
            splitToOutside: indXC,
            splitToHead: indXB
        };
    }

    /**
     * Splits an edge by inserting a new vertex at its midpoint.
     * Returns indices of all six edges involved in the split.
     */
    splitEdge(heIndex: number): number[] {
        const edge = this.halfEdges[heIndex];
        if (edge.pairIndex === -1) {
            throw new Error('Cannot split unpaired edge');
        }
        const pairIndex = edge.pairIndex; // Store this before splitting

        // Create new vertex at midpoint
        // Get vertices for midpoint calculation
        const pair = this.halfEdges[edge.pairIndex];
        const v1 = this.vertices[pair.vertexIndex].position;
        const v2 = this.vertices[edge.vertexIndex].position;
        const midpoint = new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5);
        const newVertexIndex = this.addVertex(midpoint);

        // Split both half-edges. Note that bx/xb and ax/xa are the same edges
        // from opposite sides - they form the split of the original edge
        const first = this.splitHalfEdge(heIndex, newVertexIndex);
        const second = this.splitHalfEdge(pairIndex, newVertexIndex);

        // Get the split edges from both triangles
        // For the forward edge A->B that was split into A->X->B:
        const {tailToSplit: forwardAX, splitToHead: forwardXB} = first;
        // For the backward edge B->A that was split into B->X->A:
        const {tailToSplit: backwardBX, splitToHead: backwardXA} = second;

        // Cross-link the new edges:
        // A->X pairs with X->A (forwardAX with backwardXA)
        this.halfEdges[forwardAX].pairIndex = backwardXA;
        this.halfEdges[backwardXA].pairIndex = forwardAX;
        // X->B pairs with B->X (forwardXB with backwardBX)
        this.halfEdges[forwardXB].pairIndex = backwardBX;
        this.halfEdges[backwardBX].pairIndex = forwardXB;

        // Return unique edges involved in the split (paired edges are already linked)
        return [forwardAX, forwardXB, first.splitToOutside, second.splitToOutside];
    }

    // Check if mesh is manifold (each edge has exactly one pair)
    isManifold(): boolean {
        return this.edgeMap.size === 0;
    }

    // Convert to SerializedMesh format
    toSerializedMesh(): SerializedMesh {
        const vertices: number[] = [];
        const indices: number[] = [];
        const processedEdges = new Set<number>();
        
        // Add vertices
        this.vertices.forEach(v => {
            vertices.push(v.position.x, v.position.y, v.position.z);
        });
        
        // Add faces by walking half-edges
        for (let i = 0; i < this.halfEdges.length; i++) {
            if (processedEdges.has(i)) continue;
            
            // Get vertices for this face
            const edge1 = this.halfEdges[i];
            const edge2 = this.halfEdges[edge1.nextIndex];
            const edge3 = this.halfEdges[edge2.nextIndex];
            
            indices.push(edge1.vertexIndex, edge2.vertexIndex, edge3.vertexIndex);
            
            // Mark these edges as processed - except edge1 because we won't revisit it anyways.
            // Note that edge2 and edge3 are always larger than i, because otherwise we'd have
            // already hit this face.
            processedEdges.add(edge2);
            processedEdges.add(edge3);
        }
        
        return { vertices, indices };
    }
}

import * as THREE from 'three';
import { MaxHeap } from '@datastructures-js/heap';
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

    lateSplitEdge(start: THREE.Vector3, end: THREE.Vector3, splitPoint: THREE.Vector3): number {
        // Get or create vertices
        const startIdx = this.getVertexIndex(start);
        const endIdx = this.getVertexIndex(end);
        const splitIdx = this.getVertexIndex(splitPoint);

        // Try to find existing edge
        const key = `${Math.min(startIdx, endIdx)},${Math.max(startIdx, endIdx)}`;
        const existingEdge = this.edgeMap.get(key);
        
        if (existingEdge !== undefined) {
            return this.splitEdge(existingEdge, splitPoint)[0];
        }

        // Edge doesn't exist, create new edges
        const he1 = this.halfEdges.length;
        const he2 = he1 + 1;
        
        this.halfEdges.push(
            { vertexIndex: splitIdx, nextIndex: -1, pairIndex: -1 },
            { vertexIndex: endIdx, nextIndex: -1, pairIndex: -1 }
        );

        return he1;
    }

    private getVertexIndex(pos: THREE.Vector3): number {
        const key = `${pos.x.toFixed(6)},${pos.y.toFixed(6)},${pos.z.toFixed(6)}`;
        
        for (let i = 0; i < this.vertices.length; i++) {
            const v = this.vertices[i].position;
            if (v.distanceTo(pos) < 1e-5) {
                return i;
            }
        }

        return this.addVertex(pos.clone());
    }

    addVertex(position: THREE.Vector3): number {
        const idx = this.vertices.length;
        this.vertices.push({ position });
        return idx;
    }

    addFace(v1: number, v2: number, v3: number): number {
        if (v1 < 0 || v1 >= this.vertices.length)
            throw new Error(`v1 ${v1} out of bounds 0 .. ${this.vertices.length}`);
        if (v2 < 0 || v2 >= this.vertices.length)
            throw new Error(`v2 ${v2} out of bounds 0 .. ${this.vertices.length}`);
        if (v3 < 0 || v3 >= this.vertices.length)
            throw new Error(`v3 ${v3} out of bounds 0 .. ${this.vertices.length}`);
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

        // Note: we're picking the second outside edge (i > pair). The others aren't paired yet.
        return {
            tailToSplit: indAX,
            splitToOutside: indCX,
            splitToHead: indXB
        };
    }

    /**
     * Splits an edge by inserting a new vertex at its midpoint.
     * Returns indices of all six edges involved in the split.
     */
    splitEdge(heIndex: number, midpoint: THREE.Vector3): number[] {
        const edge = this.halfEdges[heIndex];
        if (edge.pairIndex === -1) {
            throw new Error('Cannot split unpaired edge');
        }
        const pairIndex = edge.pairIndex; // Store this before splitting

        // Create new vertex at midpoint
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
        // Pick each edge to be larger than its pair for heap uniqueness.
        return [
            Math.max(forwardAX, backwardXA),
            Math.max(forwardXB, backwardBX),
            first.splitToOutside,
            second.splitToOutside,
        ];
    }

    // Check if mesh is manifold (each edge has exactly one pair)
    isManifold(): boolean {
        return this.edgeMap.size === 0;
    }

    private optimizeVertex(vertex: Vertex, sdf: (point: THREE.Vector3) => number): number {
        const maxIterations = 10;
        const epsilon = 0.0001;
        let maxMove = 0;

        for (let iter = 0; iter < maxIterations; iter++) {
            // Evaluate SDF at vertex position
            const distance = sdf(vertex.position);

            // Calculate gradient using finite differences
            const h = 0.0001; // Small offset for gradient calculation
            const pos = vertex.position;
            const gradient = new THREE.Vector3(
                (sdf(new THREE.Vector3(pos.x + h, pos.y, pos.z)) - 
                 sdf(new THREE.Vector3(pos.x - h, pos.y, pos.z))) / (2 * h),
                (sdf(new THREE.Vector3(pos.x, pos.y + h, pos.z)) - 
                 sdf(new THREE.Vector3(pos.x, pos.y - h, pos.z))) / (2 * h),
                (sdf(new THREE.Vector3(pos.x, pos.y, pos.z + h)) - 
                 sdf(new THREE.Vector3(pos.x, pos.y, pos.z - h))) / (2 * h)
            );
            gradient.normalize();
            
            // Move vertex along gradient to surface
            const move = -distance;
            vertex.position.addScaledVector(gradient, move);
            
            maxMove = Math.max(maxMove, Math.abs(move));
            
            // Stop if vertex barely moved
            if (Math.abs(move) < epsilon) {
                break;
            }
        }

        return maxMove;
    }

    protected optimizeVertices(sdf: (point: THREE.Vector3) => number): number {
        let maxMove = 0;
        
        for (const vertex of this.vertices) {
            const move = this.optimizeVertex(vertex, sdf);
            maxMove = Math.max(maxMove, move);
        }

        return maxMove;
    }

    /**
     * Performs fine subdivision of the mesh using edge-based refinement.
     *
     * Algorithm steps (note, edited; may not match function signature)
     *
     * 1. PREP
     * - Optimize every vertex to minimize |SDF| using gradient.
     * - Create priority queue for edges based on error.
     * - For each halfedge where index < pairIndex (so we only consider each pair once):
     *   - Calculate midpoint position using pair
     *   - Evaluate SDF at midpoint
     *   - Compute error metric = |SDF(midpoint)| / edge_length
     *   - If error > threshold, add to queue
     *
     * 2. REFINEMENT LOOP
     * - While queue not empty, under subdivision limit:
     *   - Pop edge with highest error
     *   - Split edge using splitEdge()
     *   - Optimize new vertex position as above
     *   - Reconsider new edges created by split as above. Probably put that in a helper.
     *   - Note that this may re-queue an existing edge; that's fine because its vertexes may have changed.
     *
     * 3. CLEANUP
     * - Verify mesh is still manifold
     * - Return refinement statistics
     *
     * @param sdf The signed distance function to use for refinement
     * @param options Configuration options including:
     *   - errorThreshold: Maximum acceptable edge error
     *   - maxSubdivisions: Limit on number of edge splits
     *   - minEdgeLength: Minimum allowed edge length
     * @returns Statistics about the refinement process
     */
    refineEdges(
        sdf: (point: THREE.Vector3) => number,
        options: {
            errorThreshold: number,
            maxSubdivisions: number,
            minEdgeLength: number
        }
    ): number {
        console.log('Starting edge refinement with options:', options);
        const { errorThreshold, maxSubdivisions, minEdgeLength } = options;

        // Priority queue for edges to split
        type EdgeQuality = {
            index: number;
            error: number;
            midpoint: THREE.Vector3;
        };

        // Initial vertex optimization
        this.optimizeVertices(sdf);

        // Helper to evaluate edge quality
        const evaluateEdge = (heIndex: number): EdgeQuality | null => {
            const edge = this.halfEdges[heIndex];
            const pair = this.halfEdges[edge.pairIndex];

            // Get edge vertices
            const v1 = this.vertices[pair.vertexIndex].position;
            const v2 = this.vertices[edge.vertexIndex].position;

            // Calculate midpoint
            const midpoint = new THREE.Vector3()
                .addVectors(v1, v2)
                .multiplyScalar(0.5);

            const length = v1.distanceTo(v2);
            if (length < minEdgeLength) {
                return null;
            }

            // Evaluate SDF at midpoint
            const error = Math.abs(sdf(midpoint));

            return {
                index: heIndex,
                error,
                midpoint
            };
        };

        // Create max heap (comparing by error)
        const heap = new MaxHeap<EdgeQuality>((edge: EdgeQuality) => edge.error);

        // Initialize queue with all edges
        for (let i = 0; i < this.halfEdges.length; i++) {
            const edge = this.halfEdges[i];
            // We'll see it again at pairIndex.
            if (edge.pairIndex > i) continue;

            const quality = evaluateEdge(i);
            if (quality && quality.error > errorThreshold) {
                heap.insert(quality);
            }
        }

        let edgesSplit = 0;

        // Main refinement loop
        while (!heap.isEmpty() && edgesSplit < maxSubdivisions) {
            const worst = heap.extractRoot()!;
            const reeval = evaluateEdge(worst.index);

            if (!reeval || reeval.error < worst.error) {
                continue; // we'll see it again
            }

            // Split the edge
            const newEdges = this.splitEdge(worst.index, worst.midpoint);
            edgesSplit++;

            // Only optimize the new vertex (last vertex added)
            const newVertex = this.vertices[this.vertices.length - 1];

            this.optimizeVertex(newVertex, sdf);
            
            // console.log(`optimized edge ${worst.index} error ${worst.error} moved by ${moveAmount}`);
            // Evaluate new edges for potential refinement
            for (const newEdge of newEdges) {
                const quality = evaluateEdge(newEdge);
                if (quality && quality.error > errorThreshold) {
                    // console.log(`reinsert new edge ${newEdge} with ${quality.error}`);
                    heap.insert(quality);
                } else {
                    // console.log(`DON'T reinsert edge ${newEdge} with ${quality?.error}`);
                }
            }
        }

        console.log(`Split ${edgesSplit} edges.`);
        return edgesSplit;
    }

    // Test-only method to access protected members
    static testing = {
      optimizeVertices: (mesh: HalfEdgeMesh, sdf: (point: THREE.Vector3) => number) => {
        return mesh.optimizeVertices(sdf);
      }
    };

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
            processedEdges.add(edge1.nextIndex);
            processedEdges.add(edge2.nextIndex);
        }
        
        return { vertices, indices };
    }
}

import * as THREE from 'three';
import { describe, test, expect, beforeEach } from 'vitest';
import { HalfEdgeMesh } from './halfedge';

describe('HalfEdgeMesh', () => {
  describe('splitEdge', () => {
    let mesh: HalfEdgeMesh;

    beforeEach(() => {
      mesh = new HalfEdgeMesh();
      
      // Create a simple two-triangle mesh sharing an edge
      // Triangle 1: (0,0,0) - (1,0,0) - (0,1,0)
      // Triangle 2: (1,0,0) - (1,1,0) - (0,1,0)
      const v0 = mesh.addVertex(new THREE.Vector3(0, 0, 0));
      const v1 = mesh.addVertex(new THREE.Vector3(1, 0, 0));
      const v2 = mesh.addVertex(new THREE.Vector3(0, 1, 0));
      const v3 = mesh.addVertex(new THREE.Vector3(1, 1, 0));

      // Add triangles - this also creates and pairs the half-edges
      mesh.addFace(v0, v1, v2); // First triangle
      mesh.addFace(v1, v3, v2); // Second triangle
    });

    test('splits shared edge correctly', () => {
      // Find the edge to split (v1->v2)
      const edgeToSplit = mesh.halfEdges.findIndex(he => 
        he.vertexIndex === 2 && // Points to v2
        mesh.halfEdges[he.nextIndex].vertexIndex === 0 // Next points to v0
      );

      // Split the edge
      const newEdges = mesh.splitEdge(edgeToSplit);
      
      // Should return 4 unique edges
      expect(newEdges).toHaveLength(4);
      
      // Check that we have the expected number of vertices (original 4 + 1 new)
      expect(mesh.vertices).toHaveLength(5);
      
      // Verify the new vertex is at the midpoint
      const midpoint = mesh.vertices[4].position;
      expect(midpoint.x).toBeCloseTo(0.5);
      expect(midpoint.y).toBeCloseTo(0.5);
      expect(midpoint.z).toBeCloseTo(0);

      // Convert to serialized format and verify triangle count
      const serialized = mesh.toSerializedMesh();
      // Should now have 4 triangles (2 per original triangle)
      expect(serialized.indices.length).toBe(36); // 4 triangles * 3 vertices * 3 coordinates per vertex
    });

    test('throws on unpaired edge', () => {
      // Create a single triangle
      const m2 = new HalfEdgeMesh();
      const a = m2.addVertex(new THREE.Vector3(0, 0, 0));
      const b = m2.addVertex(new THREE.Vector3(1, 0, 0));
      const c = m2.addVertex(new THREE.Vector3(0, 1, 0));
      const face = m2.addFace(a, b, c);

      // Attempt to split unpaired edge should throw
      expect(() => m2.splitEdge(face)).toThrow('Cannot split unpaired edge');
    });

    test('edge split preserves manifoldness', () => {
      // Create a simple manifold mesh - two triangles sharing all vertices
      const mesh = new HalfEdgeMesh();
      const a = mesh.addVertex(new THREE.Vector3(0, 0, 0));
      const b = mesh.addVertex(new THREE.Vector3(1, 0, 0));
      const c = mesh.addVertex(new THREE.Vector3(0, 1, 0));
      
      // Add two faces sharing all vertices
      mesh.addFace(a, b, c);  // ABC
      mesh.addFace(c, b, a);  // CBA - same vertices, opposite winding
      
      // This mesh is trivially manifold
      expect(mesh.isManifold()).toBe(true);

      // Split any edge
      mesh.splitEdge(0);

      // We're still manifold
      expect(mesh.isManifold()).toBe(true);
    });
  });
});

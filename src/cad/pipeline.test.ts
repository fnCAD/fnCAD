import { describe, it, expect } from 'vitest';
import { parse } from './parser';
import { moduleToSDF } from './builtins';
import { parse as parseSDF } from '../sdf_expressions/parser';
import { createOctreeNode } from '../octree';
import { MeshGenerator } from '../meshgen';
import { Vector3 } from 'three';

describe('CAD Pipeline', () => {
  it('generates correct points for a simple sphere', () => {
    // Start with CAD code for a unit sphere
    const cadCode = `sphere(1);`;
    
    // Parse CAD to AST
    const cadAst = parse(cadCode);
    
    // Convert to SDF expression
    const sdfExpr = moduleToSDF(cadAst);
    
    // Parse SDF to evaluatable AST
    const sdfAst = parseSDF(sdfExpr);
    
    // Create octree centered at origin with size 4 (plenty for unit sphere)
    const octree = createOctreeNode(
      new Vector3(0, 0, 0),
      4,
      sdfAst
    );
    
    // Subdivide octree with reasonable settings
    const minSize = 0.125; // 1/8 unit
    const cellBudget = 10000;
    octree.subdivide(sdfAst, minSize, cellBudget);
    
    // Generate mesh
    const meshGen = new MeshGenerator(octree, sdfAst, true);
    const mesh = meshGen.generate(minSize);
    
    // Verify we got a reasonable number of vertices
    expect(mesh.vertices.length).toBeGreaterThan(100); // At least some minimal detail
    expect(mesh.vertices.length).toBeLessThan(10000); // But not excessive
    
    // Verify all vertices lie approximately on unit sphere
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      const x = mesh.vertices[i];
      const y = mesh.vertices[i + 1];
      const z = mesh.vertices[i + 2];
      const radius = Math.sqrt(x*x + y*y + z*z);
      expect(radius).toBeCloseTo(1, 2); // Within 0.01 of unit radius
    }
    
    // Verify we got some triangles
    expect(mesh.indices.length).toBeGreaterThan(100);
    expect(mesh.indices.length % 3).toBe(0); // Must be multiple of 3
    
    // Verify triangle indices are valid
    const maxIndex = mesh.vertices.length / 3 - 1;
    for (const index of mesh.indices) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThanOrEqual(maxIndex);
    }
  });
});

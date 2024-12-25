import { describe, it, expect } from 'vitest';
import { parse } from './cad/parser';
import { moduleToSDF } from './cad/builtins';
import { parse as parseSDF } from './sdf_expressions/parser';
import { createOctreeNode, subdivideOctree } from './octree';
import { MeshGenerator } from './meshgen';
import { Vector3 } from 'three';

describe('Mesh generation', () => {
  it('generates correct points for a simple sphere', () => {
    // Start with CAD code for a unit sphere
    const cadCode = `sphere(1);`;
    
    // Parse CAD to AST
    const cadAst = parse(cadCode);
    
    // Convert to SDF expression
    const sdfExpr = moduleToSDF(cadAst);
    
    // Parse SDF to evaluatable AST
    const sdfAst = parseSDF(sdfExpr);
    
    // Create full octree
    const octree = createOctreeNode(
      new Vector3(0, 0, 0),
      65536,
      sdfAst
    );
    
    // Subdivide octree with reasonable settings
    const minSize = 2;
    const cellBudget = 10000;
    subdivideOctree(octree, sdfAst, minSize, cellBudget);
    
    // Generate mesh
    const meshGen = new MeshGenerator(octree, sdfAst, true);
    const mesh = meshGen.generate(minSize);
    
    expect(mesh.vertices.length).toBeGreaterThan(0);
    
    // Verify all vertices lie approximately on unit sphere
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      const x = mesh.vertices[i];
      const y = mesh.vertices[i + 1];
      const z = mesh.vertices[i + 2];
      const radius = Math.sqrt(x*x + y*y + z*z);
      expect(radius).toBeCloseTo(1, 2); // Within 0.01 of unit radius
    }
  });
});

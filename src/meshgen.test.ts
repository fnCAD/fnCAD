import { describe, it, expect } from 'vitest';
import { parse } from './cad/parser';
import { moduleToSDF } from './cad/builtins';
import { parse as parseSDF } from './sdf_expressions/parser';
import { BudgetTracker, OctreeNode, CellState, subdivideOctree } from './octree';
import { MeshGenerator } from './meshgen';
import { Vector3 } from 'three';

describe('Mesh generation', () => {
  it('generates correct points for a simple sphere', () => {
    // Start with CAD code for a unit sphere
    const cadCode = `sphere(1);`;

    // Parse CAD to AST
    const cadAst = parse(cadCode);

    // Convert to SDF expression
    const sdfExpr = moduleToSDF(cadAst).expr;

    // Parse SDF to evaluatable AST
    const sdfAst = parseSDF(sdfExpr);

    // Create full octree
    const octree = new OctreeNode(CellState.Boundary);

    // Subdivide octree with reasonable settings
    subdivideOctree(octree, sdfAst, new Vector3(0, 0, 0), 65536, new BudgetTracker(10000));

    // Generate mesh
    const meshGen = new MeshGenerator(octree, sdfAst);
    const mesh = meshGen.generate();

    expect(mesh.indices.length / 3).toBe(816);

    // Verify all vertices lie approximately on unit sphere
    for (const index of mesh.indices) {
      const x = mesh.vertices[index * 3];
      const y = mesh.vertices[index * 3 + 1];
      const z = mesh.vertices[index * 3 + 2];
      const radius = Math.sqrt(x * x + y * y + z * z);
      expect(radius).toBeCloseTo(1, 2); // Within 0.01 of unit radius
    }
  });
});

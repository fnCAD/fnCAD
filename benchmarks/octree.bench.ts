import { describe, bench } from 'vitest'
import { parse } from '../src/cad/parser'
import { moduleToSDF } from '../src/cad/builtins'
import { parse as parseSDF } from '../src/sdf_expressions/parser'
import { createOctreeNode } from '../src/octree'
import * as THREE from 'three'

const COMPLEX_SCENE = `
for (var i = [-5:5]) {
  union() for (var j = [-5:5]) {
    rotate([j*10, 0, 0]) translate([i, 0, j]) sphere(0.5);
  }
}
`

describe('Octree Generation Benchmarks', () => {
  bench('build octree for complex scene', () => {
    // Parse CAD code into SDF expression
    const cadAst = parse(COMPLEX_SCENE)
    const sdfExpr = moduleToSDF(cadAst)
    const sdf = parseSDF(sdfExpr)
    
    // Create and subdivide octree
    const octree = createOctreeNode(new THREE.Vector3(0, 0, 0), 65536, sdf)
    octree.subdivide(sdf, 0.1, 100000)
  })
})

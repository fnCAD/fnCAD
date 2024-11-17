import { describe, it, expect } from 'vitest';
import { OctreeNode, OctreeRenderSettings } from './octree';
import { parse } from './parser';
import * as THREE from 'three';

// Test helper to assert octree equality
function assertOctreesEqual(a: OctreeNode, b: OctreeNode): void {
  expect(a.size).toBe(b.size, `Size mismatch: ${a.size} vs ${b.size}`);
  expect(a.state).toBe(b.state, `State mismatch: ${a.state} vs ${b.state}`);
  expect(a.hasGeometry).toBe(b.hasGeometry, 'Geometry presence mismatch');
  expect(a.center.equals(b.center)).toBe(true, 
    `Center mismatch: ${a.center.toArray()} vs ${b.center.toArray()}`);
  
  // Compare children recursively
  for (let i = 0; i < 8; i++) {
    const aChild = a.children[i];
    const bChild = b.children[i];
    
    expect(!!aChild).toBe(!!bChild, `Child presence mismatch at index ${i}`);
    
    if (aChild && bChild) {
      assertOctreesEqual(aChild, bChild);
    }
  }
}

describe('Octree', () => {
  it('maintains consistent structure when increasing render detail', () => {
    // Define render sizes we'll test with
    const smallRenderSize = 0.1;  // High detail
    const largeRenderSize = 0.5;  // Low detail
    const subdivisionSize = 0.5;  // Fixed subdivision size
    const cellBudget = 1000;

    // Create a simple sphere SDF
    const ast = parse('sqrt(x*x + y*y + z*z) - 1.0');

    // Path 1: Start with low detail, then switch to high detail
    const lowDetailFirst = new OctreeNode(new THREE.Vector3(0, 0, 0), 4, ast);
    lowDetailFirst.subdivide(subdivisionSize, cellBudget,
      new OctreeRenderSettings(true, true, true, largeRenderSize));
    lowDetailFirst.updateGeometry(
      new OctreeRenderSettings(true, true, true, smallRenderSize));

    // Path 2: Start directly with high detail
    const highDetailDirect = new OctreeNode(new THREE.Vector3(0, 0, 0), 4, ast);
    highDetailDirect.subdivide(subdivisionSize, cellBudget,
      new OctreeRenderSettings(true, true, true, smallRenderSize));

    // Both paths should result in identical octree structures
    assertOctreesEqual(lowDetailFirst, highDetailDirect);

    // Verify that low detail actually creates less geometry
    const lowDetailDirect = new OctreeNode(new THREE.Vector3(0, 0, 0), 4, ast);
    lowDetailDirect.subdivide(subdivisionSize, cellBudget,
      new OctreeRenderSettings(true, true, true, largeRenderSize));
    expect(() => assertOctreesEqual(lowDetailDirect, highDetailDirect))
      .toThrow('Octrees should differ due to render size');
  });
});

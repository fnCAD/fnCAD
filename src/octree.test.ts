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
  it('maintains consistent geometry after render settings change', () => {
    // Test that the order of adjusting min cell size and min render size sliders
    // does not affect the final octree structure - the end result should be
    // the same regardless of which slider was moved first
    // Create a simple sphere SDF
    const ast = parse('sqrt(x*x + y*y + z*z) - 1.0');
    const modifiedOctree = new OctreeNode(new THREE.Vector3(0, 0, 0), 4, ast);

    // Initial subdivision with small render size (0.1)
    const smallRenderSettings = new OctreeRenderSettings(true, true, true, 0.1);
    modifiedOctree.subdivide(0.5, 1000, smallRenderSettings);

    // Save a copy before modification
    const originalOctree = modifiedOctree.dup();

    // Update the octree with larger render size (0.5)
    const largeRenderSettings = new OctreeRenderSettings(true, true, true, 0.5);
    modifiedOctree.updateGeometry(largeRenderSettings);

    // Create new octree directly with large render size
    const referenceOctree = new OctreeNode(new THREE.Vector3(0, 0, 0), 4, ast);
    referenceOctree.subdivide(0.5, 1000, largeRenderSettings);

    // The modified octree should match one created fresh with large settings
    assertOctreesEqual(modifiedOctree, referenceOctree);

    // But should differ from its original state with small settings
    expect(() => assertOctreesEqual(modifiedOctree, originalOctree))
      .toThrow('Octree should differ from initial state');
  });
});

import { describe, it, expect } from 'vitest';
import { OctreeNode, OctreeRenderSettings } from './octree';
import { parse } from './parser';
import * as THREE from 'three';

// Test helper to assert octree equality
function assertOctreesEqual(a: OctreeNode, b: OctreeNode): {equal: boolean, reason?: string} {
  if (a.size !== b.size) {
    return {equal: false, reason: `Size mismatch: ${a.size} vs ${b.size}`};
  }
  if (a.state !== b.state) {
    return {equal: false, reason: `State mismatch: ${a.state} vs ${b.state}`};
  }
  if (a.hasGeometry !== b.hasGeometry) {
    return {equal: false, reason: 'Geometry presence mismatch'};
  }
  if (!a.center.equals(b.center)) {
    return {equal: false, reason: `Center mismatch: ${a.center.toArray()} vs ${b.center.toArray()}`};
  }
  
  // Compare children recursively
  for (let i = 0; i < 8; i++) {
    const aChild = a.children[i];
    const bChild = b.children[i];
    
    if (!!aChild !== !!bChild) {
      return {equal: false, reason: `Child presence mismatch at index ${i}`};
    }
    
    if (aChild && bChild) {
      const childComparison = assertOctreesEqual(aChild, bChild);
      if (!childComparison.equal) {
        return {equal: false, reason: `Child ${i}: ${childComparison.reason}`};
      }
    }
  }
  
  return {equal: true};
}

describe('Octree', () => {
  it('maintains consistent geometry after render settings change', () => {
    // Test that the order of adjusting min cell size and min render size sliders
    // does not affect the final octree structure - the end result should be
    // the same regardless of which slider was moved first
    // Create a simple sphere SDF
    const ast = parse('sqrt(x*x + y*y + z*z) - 1.0');
    const octree = new OctreeNode(new THREE.Vector3(0, 0, 0), 4, ast);

    // Initial subdivision with small render size
    const initialSettings = new OctreeRenderSettings(true, true, true, 0.1);
    octree.subdivide(0.5, 1000, initialSettings);

    // Make a copy of the initial octree
    const initialOctree = octree.dup();

    // Update original with larger render size
    const newSettings = new OctreeRenderSettings(true, true, true, 0.5);
    octree.updateGeometry(newSettings);

    // Create fresh octree with new settings
    const freshOctree = new OctreeNode(new THREE.Vector3(0, 0, 0), 4, ast);
    freshOctree.subdivide(0.5, 1000, newSettings);

    // Compare octrees
    const freshComparison = assertOctreesEqual(octree, freshOctree);
    expect(freshComparison.equal).toBe(true, `Fresh comparison failed: ${freshComparison.reason}`);

    const initialComparison = assertOctreesEqual(octree, initialOctree);
    expect(initialComparison.equal).toBe(false, 'Octree should differ from initial state');
  });
});

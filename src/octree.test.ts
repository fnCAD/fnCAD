import { describe, it, expect } from 'vitest';
import { OctreeNode, OctreeRenderSettings } from './octree';
import { parse } from './parser';
import * as THREE from 'three';

describe('Octree', () => {
  it('maintains consistent geometry after render settings change', () => {
    // Create a simple sphere SDF
    const ast = parse('sqrt(x*x + y*y + z*z) - 1.0');
    const octree = new OctreeNode(new THREE.Vector3(0, 0, 0), 8, ast);

    // Initial subdivision with small render size
    const initialSettings = new OctreeRenderSettings(true, true, true, 0.1);
    octree.subdivide(0.1, 1000, initialSettings);

    // Store initial geometry state
    const initialGeometryState = octree.children.map(child => 
      child ? child.hasGeometry : null
    );

    // Update with larger render size
    const newSettings = new OctreeRenderSettings(true, true, true, 0.5);
    octree.updateGeometry(newSettings);

    // Store new geometry state
    const updatedGeometryState = octree.children.map(child =>
      child ? child.hasGeometry : null
    );

    // Create fresh octree with new settings
    const freshOctree = new OctreeNode(new THREE.Vector3(0, 0, 0), 8, ast);
    freshOctree.subdivide(0.1, 1000, newSettings);
    const freshGeometryState = freshOctree.children.map(child =>
      child ? child.hasGeometry : null
    );

    // Compare states
    expect(updatedGeometryState).toEqual(freshGeometryState);
    expect(updatedGeometryState).not.toEqual(initialGeometryState);
  });
});

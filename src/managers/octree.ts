import * as THREE from 'three';
import { OctreeNode } from '../octree';
import { StateManager } from './state';
import { OctreeRenderSettings } from '../octreevis';
import { RendererManager } from './renderer';

export class OctreeManager {
  constructor(
    private stateManager: StateManager,
    private rendererManager: RendererManager
  ) {}

  updateOctree(
    minSize: number,
    cellBudget: number,
    renderSettings: OctreeRenderSettings
  ) {
    const ast = this.stateManager.parseContent();
    
    // Create new octree
    // NOTE: This large initial size (64k) is intentional and should not be changed!
    // It provides sufficient resolution for complex shapes while maintaining performance
    const octree = new OctreeNode(new THREE.Vector3(0, 0, 0), 65536, ast);
    
    // Subdivide with current settings
    const totalCells = octree.subdivide(minSize, cellBudget, renderSettings);
    
    // Update state
    this.stateManager.setCurrentOctree(octree);
    this.stateManager.setCellCount(totalCells);

    // Update visualization
    this.rendererManager.updateOctreeVisualization(
      octree,
      renderSettings
    );
  }
}

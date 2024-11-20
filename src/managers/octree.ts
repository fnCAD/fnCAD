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

  async updateOctree(
    minSize: number,
    cellBudget: number,
    renderSettings: OctreeRenderSettings
  ) {
    const source = this.stateManager.getEditorContent();
    
    // Create octree task
    const taskId = this.stateManager.taskQueue.addTask({
      type: 'octree',
      minSize,
      cellBudget,
      source
    });
    
    // Set this as the active task
    this.stateManager.setActiveTaskId(taskId);


    try {
      // Wait for task completion
      const task = await new Promise<TaskProgress>((resolve, reject) => {
        const unsubscribe = this.stateManager.taskQueue.onProgress((progress) => {
          if (progress.taskId === taskId && 
             (progress.status === 'completed' || progress.status === 'failed')) {
            unsubscribe();
            if (progress.status === 'failed') {
              reject(new Error(progress.error));
            } else {
              resolve(progress);
            }
          }
        });
      });

      if (task.status === 'completed' && task.result) {
        const octree = task.result as OctreeNode;
        
        // Update state
        this.stateManager.setCurrentOctree(octree);
        this.stateManager.setCellCount(octree.getCellCount());

        // Update visualization
        const showOctree = this.stateManager.isOctreeVisible();
        this.rendererManager.updateOctreeVisualization(
          octree,
          renderSettings,
          showOctree
        );
      }
    } catch (error) {
      console.error('Octree generation failed:', error);
      throw error;
    }
  }
}

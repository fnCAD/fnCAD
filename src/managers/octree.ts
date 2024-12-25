import { OctreeNode } from '../octree';
import { TaskProgress } from '../workers/task_types';
import { StateManager } from './state';
import { RendererManager } from './renderer';
import { SettingsManager } from './settings';

export class OctreeManager {
  constructor(
    private stateManager: StateManager,
    private rendererManager: RendererManager,
    private settingsManager: SettingsManager
  ) {}

  async updateOctree() {
    const startTime = performance.now();
    const source = this.stateManager.getEditorContent();
    
    // Create octree task
    const taskId = this.stateManager.taskQueue.addTask({
      type: 'octree',
      minSize: this.settingsManager.getMinSize(),
      cellBudget: this.settingsManager.getCellBudget(),
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
        // Reconstruct OctreeNode from serialized data
        const reconstructOctree = (data: any, parent: OctreeNode | null = null): OctreeNode => {
          if (!data) {
            throw new Error('Cannot reconstruct null octree data');
          }
          
          // Detailed validation with specific error messages
          if (typeof data.state !== 'number') {
            throw new Error('Invalid octree data: state must be a number');
          }
          if (typeof data.octant !== 'number') {
            throw new Error('Invalid octree data: octant must be a number');
          }

          // Create node with proper prototype chain
          const node = Object.assign(new OctreeNode(
            data.state,
            parent,
            data.octant
          ), {
            // Restore any additional properties from serialized data
            children: new Array(8).fill(null)
          });
          
          if (!Array.isArray(data.children)) {
            throw new Error('Invalid children array in octree data');
          }

          // Recursively reconstruct children
          node.children = data.children.map((child: any) => 
            child ? reconstructOctree(child, node) : null
          );
          
          return node;
        };

        const octree = reconstructOctree(task.result);
        
        // Update state
        this.stateManager.setCurrentOctree(octree);
        this.stateManager.setCellCount(octree.getCellCount());
        this.stateManager.updateOctreeTaskTime(startTime);

        // Update visualization
        const showOctree = this.stateManager.isOctreeVisible();
        this.rendererManager.updateOctreeVisualization(octree, showOctree);
      }
    } catch (error) {
      console.error('Octree generation failed:', error);
      throw error;
    }
  }
}

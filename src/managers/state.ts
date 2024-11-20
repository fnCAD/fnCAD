import * as THREE from 'three';
import { Material } from 'three';
import { OctreeNode } from '../octree';
import { Node as SdfNode } from '../sdf_expressions/ast';
import { TaskQueue } from '../workers/tasks';
import { TaskProgress } from '../workers/messages';
import { RendererManager } from './renderer';
import { parse as parseCAD } from '../cad/parser';
import { moduleToSDF } from '../cad/builtins';
import { parse as parseSDF } from '../sdf_expressions/parser';
import { generateShader } from '../shader';

export class StateManager {
  private currentOctree: OctreeNode | null = null;
  private currentMesh: THREE.Mesh | null = null;
  private editorContent: string = '';
  private cellCount: number = 0;
  private currentShader: string | null = null;

  taskQueue: TaskQueue;
  private activeTaskId: string | null = null;

  setActiveTaskId(taskId: string | null) {
    console.log('Setting active task ID:', taskId);
    this.activeTaskId = taskId;
  }

  constructor(
    private rendererManager: RendererManager
  ) {
    this.taskQueue = new TaskQueue();
    this.taskQueue.onProgress(this.handleTaskProgress.bind(this));
  }

  private handleTaskProgress(progress: TaskProgress) {
    console.log('Received task progress:', {
      taskId: progress.taskId,
      type: progress.type,
      status: progress.status,
      progress: progress.progress,
      result: progress.result ? 'present' : 'missing'
    });

    // Only handle progress if this is the active task
    if (progress.taskId === this.activeTaskId) {
      console.log('Task matches active task ID:', this.activeTaskId);
      console.log('Updating renderer with progress:', progress);
      this.rendererManager.updateProgress(progress);
      console.log('Renderer progress updated');
      
      if (progress.status === 'completed' && progress.result) {
        console.log('Task completed with result:', progress.type);
        
        // Handle completed tasks based on type
        switch (progress.type) {
          case 'octree':
            console.log('Handling octree task completion');
            console.log('Result:', progress.result);
            if (!progress.result) {
              console.error('No octree result received');
              return;
            }
            console.log('Setting octree result:', progress.result);
            if (!progress.result || typeof progress.result.getCellCount !== 'function') {
              console.error('Invalid octree result:', progress.result);
              return;
            }
            this.setCurrentOctree(progress.result);
            const cellCount = progress.result.getCellCount();
            console.log('Setting cell count:', cellCount);
            this.setCellCount(cellCount);
            console.log('Updating octree visualization');
            this.rendererManager.updateOctreeVisualization(
              progress.result,
              true // Show the octree by default when complete
            );
            console.log('Octree task handling complete');
            break;
          case 'mesh':
            console.log('Setting mesh result');
            this.setCurrentMesh(progress.result);
            // Mesh update is handled in setCurrentMesh
            break;
        }
      }
    }
  }

  updateEditorContent(content: string) {
    if (content !== this.editorContent) {
      this.editorContent = content;
    }
  }

  getEditorContent(): string {
    return this.editorContent;
  }

  setCurrentOctree(octree: OctreeNode | null) {
    this.currentOctree = octree;
  }

  setCurrentMesh(mesh: THREE.Mesh | null) {
    if (this.currentMesh) {
      this.currentMesh.geometry.dispose();
      if (this.currentMesh.material instanceof Material) {
        this.currentMesh.material.dispose();
      } else {
        this.currentMesh.material.forEach(m => m.dispose());
      }
    }
    this.currentMesh = mesh;
    this.rendererManager.updateMesh(mesh);
  }

  setCellCount(count: number) {
    const statsPanel = document.getElementById('stats-panel');
    if (statsPanel) {
      statsPanel.textContent = `Octree cells: ${count}`;
    }
    this.cellCount = count;
  }

  parseContent(): SdfNode {
    const cadAst = parseCAD(this.editorContent);
    const sdfExpr = moduleToSDF(cadAst);
    return parseSDF(sdfExpr);
  }

  setCurrentShader(shader: string | null) {
    this.currentShader = shader;
    if (shader) {
      this.rendererManager.updateShader(shader);
    }
  }

  updateShader(ast: SdfNode) {
    const fragmentShader = generateShader(ast);
    this.setCurrentShader(fragmentShader);
  }

  getCurrentOctree(): OctreeNode | null {
    return this.currentOctree;
  }

  isOctreeVisible(): boolean {
    const checkbox = document.getElementById('show-octree') as HTMLInputElement;
    return checkbox?.checked ?? false;
  }

  getState() {
    return {
      currentOctree: this.currentOctree,
      currentMesh: this.currentMesh,
      editorContent: this.editorContent,
      cellCount: this.cellCount,
      currentShader: this.currentShader
    };
  }
}

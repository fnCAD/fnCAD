import * as THREE from 'three';
import { OctreeNode } from '../octree';
import { SerializedMesh } from '../workers/mesh_types';
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
  private currentMesh: THREE.Mesh | SerializedMesh | null = null;
  private editorContent: string = '';
  private cellCount: number = 0;
  private currentShader: string | null = null;

  taskQueue: TaskQueue;
  private activeTaskId: string | null = null;

  setActiveTaskId(taskId: string | null) {
    this.activeTaskId = taskId;
  }

  constructor(
    private rendererManager: RendererManager
  ) {
    this.taskQueue = new TaskQueue();
    this.taskQueue.onProgress(this.handleTaskProgress.bind(this));
  }

  private handleTaskProgress(progress: TaskProgress) {
    // Only handle UI progress updates
    if (progress.taskId === this.activeTaskId) {
      this.rendererManager.updateProgress(progress);
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

  setCurrentMesh(mesh: SerializedMesh | THREE.Mesh | null) {
    if (this.currentMesh instanceof THREE.Mesh) {
      this.currentMesh.geometry.dispose();
      if (Array.isArray(this.currentMesh.material)) {
        this.currentMesh.material.forEach(m => m.dispose());
      } else {
        this.currentMesh.material.dispose();
      }
    }

    this.currentMesh = mesh;
    // Convert THREE.Mesh to SerializedMesh before passing to renderer
    if (mesh instanceof THREE.Mesh) {
      const geometry = mesh.geometry;
      const position = geometry.attributes.position;
      const index = geometry.index;
      
      if (!index) {
        throw new Error('Geometry must be indexed');
      }
      
      const serialized: SerializedMesh = {
        vertices: Array.from(position.array),
        indices: Array.from(index.array)
      };
      this.rendererManager.updateMesh(serialized);
    } else {
      this.rendererManager.updateMesh(mesh);
    }
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

  setCurrentShader(shader: string | null, visible: boolean = true) {
    this.currentShader = shader;
    if (shader) {
      this.rendererManager.updateShader(shader, visible);
    }
  }

  updateShader(ast: SdfNode) {
    const fragmentShader = generateShader(ast);
    const isVisible = this.rendererManager.isRaymarchedVisible();
    this.setCurrentShader(fragmentShader, isVisible);
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

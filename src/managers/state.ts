import * as THREE from 'three';
import { OctreeNode } from '../octree';
import { SerializedMesh } from '../workers/mesh_types';
import { Node as SdfNode } from '../sdf_expressions/ast';
import { TaskQueue } from '../workers/tasks';
import { errorDecorationFacet } from '../main';
import { TaskProgress } from '../workers/messages';
import { RendererManager } from './renderer';
import { parse as parseCAD } from '../cad/parser';
import { moduleToSDF } from '../cad/builtins';
import { parse as parseSDF } from '../sdf_expressions/parser';
import { generateShader } from '../shader';
import { ParseError } from '../cad/errors';

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
    private rendererManager: RendererManager,
    private settingsManager: import('./settings').SettingsManager
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
    this.cellCount = count;
    
    // Update detailed stats if octree exists
    if (this.currentOctree) {
      const insideCount = this.currentOctree.countInside();
      const outsideCount = this.currentOctree.countOutside();
      const boundaryCount = this.currentOctree.countBoundary();
      
      document.getElementById('inside-cells')!.textContent = insideCount.toString();
      document.getElementById('outside-cells')!.textContent = outsideCount.toString();
      document.getElementById('boundary-cells')!.textContent = boundaryCount.toString();
    }
  }

  public updateOctreeTaskTime(startTime: number) {
    const endTime = performance.now();
    const duration = endTime - startTime;
    document.getElementById('last-update-time')!.textContent = `${duration.toFixed(1)}ms`;
  }

  parseContent(): SdfNode {
    try {
      const cadAst = parseCAD(this.editorContent);
      const sdfExpr = moduleToSDF(cadAst);
      const sdfNode = parseSDF(sdfExpr);
      
      // Clear any existing error decorations
      if (window._editor) {
        window._editor.dispatch({
          effects: [errorDecorationFacet.of([])]
        });
      }
      
      return sdfNode;
    } catch (err) {
      // Only handle ParseError instances
      if (err instanceof ParseError) {
        if (window._editor) {
          try {
            const from = window._editor.state.doc.line(err.location.start.line).from + err.location.start.column - 1;
            const to = window._editor.state.doc.line(err.location.end.line).from + err.location.end.column - 1;
            
            window._editor.dispatch({
              effects: [errorDecorationFacet.of([{
                from,
                to,
                error: err.message
              }])]
            });
          } catch (e) {
            console.error('Error while setting error decoration:', e);
          }
        }
      }
      throw err;
    }
  }

  setCurrentShader(shader: string | null) {
    this.currentShader = shader;
    if (shader) {
      this.rendererManager.updateShader(shader);
    }
  }

  updateShader(ast: SdfNode) {
    const fragmentShader = generateShader(ast);
    const isVisible = this.settingsManager.isRaymarchedVisible();
    
    // When invisible, modify the scene() function to return inf
    const modifiedShader = isVisible ? fragmentShader : 
      fragmentShader.replace(
        /float scene\(vec3 pos\) {/s,
        'float scene(vec3 pos) {\n  return 1.0e10;\n'
      );
    
    this.setCurrentShader(modifiedShader);
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

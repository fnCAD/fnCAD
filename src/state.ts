import * as THREE from 'three';
import { parse as parseCAD } from './cad/parser';
import { moduleToSDF } from './cad/builtins';
import { parse as parseSDF } from './sdf_expressions/parser';
import { generateShader } from './shader';
import { ParseError } from './cad/errors';
import { errorDecorationFacet } from './main';
import { OctreeNode } from './octree';
import { SerializedMesh } from './types';

export class AppState {
  private currentMesh: SerializedMesh | null = null;
  private editorContent: string = '';
  private currentShader: string | null = null;
  private meshGenerationInProgress = false;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private camera: THREE.PerspectiveCamera
  ) {}

  updateEditorContent(content: string) {
    if (content !== this.editorContent) {
      this.editorContent = content;
      this.updateShader();
    }
  }

  private updateShader() {
    try {
      const cadAst = parseCAD(this.editorContent);
      const sdfExpr = moduleToSDF(cadAst);
      const sdfNode = parseSDF(sdfExpr);
      this.currentShader = generateShader(sdfNode);

      // Clear any existing error decorations
      if (window._editor) {
        window._editor.dispatch({
          effects: [errorDecorationFacet.of([])]
        });
      }
    } catch (err) {
      if (err instanceof ParseError && window._editor) {
        const from = window._editor.state.doc.line(err.location.start.line).from +
                    err.location.start.column - 1;
        const to = window._editor.state.doc.line(err.location.end.line).from +
                  err.location.end.column - 1;

        window._editor.dispatch({
          effects: [errorDecorationFacet.of([{
            from,
            to,
            error: err.message
          }])]
        });
      }
      throw err;
    }
  }

  getShader(): string | null {
    return this.currentShader;
  }

  setCurrentMesh(mesh: SerializedMesh | null) {
    this.currentMesh = mesh;
  }

  getCurrentMesh(): SerializedMesh | null {
    return this.currentMesh;
  }

  setMeshGenerationInProgress(inProgress: boolean) {
    this.meshGenerationInProgress = inProgress;
  }

  isMeshGenerationInProgress(): boolean {
    return this.meshGenerationInProgress;
  }

  getEditorContent(): string {
    return this.editorContent;
  }
}

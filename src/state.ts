import * as THREE from 'three';
import { parse as parseCAD } from './cad/parser';
import { moduleToSDF } from './cad/builtins';
import { parse as parseSDF } from './sdf_expressions/parser';
import { generateShader } from './shader';
import { ParseError } from './cad/errors';
import { errorDecorationFacet } from './main';
import { SerializedMesh } from './types';

export enum ViewMode {
  Preview,  // GLSL raymarching preview
  Mesh      // Triangle mesh view
}

export class AppState {
  private currentMesh: SerializedMesh | null = null;
  private editorContent: string = '';
  private currentShader: string | null = null;
  private meshGenerationInProgress = false;
  private viewMode: ViewMode = ViewMode.Preview;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private previewPane: HTMLElement;
  private previewMaterial: THREE.ShaderMaterial | null = null;

  constructor(
    private camera: THREE.PerspectiveCamera
  ) {
    this.previewPane = document.getElementById('preview-pane')!;
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.previewPane.appendChild(this.renderer.domElement);
    
    // Set up initial size
    this.updateSize();
    
    // Handle window resize
    window.addEventListener('resize', () => this.updateSize());
    
    // Start render loop
    this.animate();
  }

  private updateSize() {
    const width = this.previewPane.clientWidth;
    const height = this.previewPane.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    
    // Update shader uniforms if in preview mode
    if (this.viewMode === ViewMode.Preview) {
      const previewMaterial = this.previewMaterial;
      if (!previewMaterial) {
        console.warn("No preview material found in scene");
        return;
      }
      if (previewMaterial?.uniforms) {
        previewMaterial.uniforms.resolution.value.set(
          this.previewPane.clientWidth,
          this.previewPane.clientHeight
        );
        previewMaterial.uniforms.customCameraPosition.value.copy(this.camera.position);
        previewMaterial.uniforms.customViewMatrix.value.copy(this.camera.matrixWorldInverse);
        previewMaterial.uniforms.projectionMatrix.value.copy(this.camera.projectionMatrix);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  setViewMode(mode: ViewMode) {
    console.log("Setting view mode to:", mode);
    this.viewMode = mode;
    
    console.log("Clearing scene, current children:", this.scene.children.length);
    // Clear scene
    while(this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
    console.log("Scene cleared, remaining children:", this.scene.children.length);
    
    // Set up scene based on mode
    if (mode === ViewMode.Preview) {
      // Create a full-screen quad for raymarching
      const planeGeometry = new THREE.PlaneGeometry(2, 2);
      console.log("Creating preview plane material with shader:", this.currentShader?.substring(0, 100) + "...");
      // Create or update preview material
      this.previewMaterial = new THREE.ShaderMaterial({
        uniforms: {
          resolution: { value: new THREE.Vector2(this.previewPane.clientWidth, this.previewPane.clientHeight) },
          fov: { value: 75.0 },
          customCameraPosition: { value: this.camera.position },
          customViewMatrix: { value: this.camera.matrixWorldInverse },
          projectionMatrix: { value: this.camera.projectionMatrix }
        },
        vertexShader: `
          void main() {
            gl_Position = vec4(position, 1.0);
          }
        `,
        fragmentShader: this.currentShader || 'void main() { gl_FragColor = vec4(0.5, 0.5, 0.5, 1.0); }'
      });
      const previewPlane = new THREE.Mesh(planeGeometry, this.previewMaterial);
      previewPlane.frustumCulled = false; // Ensure plane is always rendered
      this.scene.add(previewPlane);
      console.log("Added preview plane to scene, children:", this.scene.children.length);
    } else if (mode === ViewMode.Mesh && this.currentMesh) {
      // Add mesh to scene
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.currentMesh.vertices, 3));
      geometry.setIndex(this.currentMesh.indices);
      const material = new THREE.MeshStandardMaterial({ color: 0x808080 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.isMeshObject = true;
      this.scene.add(mesh);
    }
  }

  getViewMode(): ViewMode {
    return this.viewMode;
  }

  updateEditorContent(content: string) {
    if (content !== this.editorContent) {
      this.editorContent = content;
      this.updateShader();
    }
  }

  private updateShader() {
    console.log("Updating shader from editor content:", this.editorContent.substring(0, 100) + "...");
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

  private worker: Worker | null = null;
  private currentTaskId: number = 0;

  generateMesh(highDetail: boolean = false): void {
    // Cancel any existing task
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.meshGenerationInProgress = true;
    this.setViewMode(ViewMode.Mesh);
    const taskId = ++this.currentTaskId;

    // Create new worker
    this.worker = new Worker(new URL('./worker/mesh-worker.ts', import.meta.url), {
      type: 'module'
    });

    // Set up message handling
    this.worker.onmessage = (e) => {
      // Ignore messages from old tasks
      if (taskId !== this.currentTaskId) return;

      if (e.data.type === 'progress') {
        const percent = Math.round(e.data.progress * 100);
        const progressElement = document.createElement('div');
        progressElement.className = 'mesh-progress';
        progressElement.textContent = `${e.data.phase}: ${percent}%`;
        
        // Remove any existing progress element
        const existing = this.previewPane.querySelector('.mesh-progress');
        if (existing) {
          existing.remove();
        }
        
        this.previewPane.appendChild(progressElement);
      } else if (e.data.type === 'complete') {
        // Remove progress indicator
        const progressElement = this.previewPane.querySelector('.mesh-progress');
        if (progressElement) {
          progressElement.remove();
        }
        this.setCurrentMesh(e.data.mesh);
        this.meshGenerationInProgress = false;
        this.worker = null;
      }
    };

    // Start mesh generation
    try {
      this.worker.postMessage({
        type: 'start',
        code: this.editorContent,
        highDetail
      });
    } catch (error) {
      console.error('Failed to start mesh generation:', error);
      this.cancelCurrentOperation();
      throw error;
    }

    // Add error handler
    this.worker.onerror = (error) => {
      console.error('Mesh generation worker error:', error);
      this.cancelCurrentOperation();
      const progressElement = this.previewPane.querySelector('.mesh-progress');
      if (progressElement) {
        progressElement.remove();
      }
    };
  }

  cancelCurrentOperation(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.meshGenerationInProgress = false;
    this.setViewMode(ViewMode.Preview);
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

import * as THREE from 'three';
import { parse as parseCAD } from './cad/parser';
import { moduleToSDF } from './cad/builtins';
import { parse as parseSDF } from './sdf_expressions/parser';
import { generateShader } from './shader';
import { ParseError } from './cad/errors';
import { errorDecorationFacet } from './main';
import { SerializedMesh } from './types';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EditorState } from '@codemirror/state';

export interface CameraState {
  position: { x: number; y: number; z: number };
  target?: { x: number; y: number; z: number }; // For orbit controls
}

export interface DocumentStorage {
  provider: 'gist' | 'gdrive' | null;
  externalId?: string;
  writable: boolean;
  filename?: string;
}

export interface Document {
  id: string;
  name: string;
  content: string;
  cameraState?: CameraState;
  storage?: DocumentStorage;
  editorState?: EditorState; // Store editor state with history
}

export enum ViewMode {
  Preview, // GLSL raymarching preview
  Mesh, // Triangle mesh view
}

export class AppState {
  private currentMesh: SerializedMesh | null = null;
  private documents: Document[] = [];
  private activeDocumentId: string | null = null;
  private currentShader: string | null = null;
  private meshGenerationInProgress = false;
  private viewMode: ViewMode = ViewMode.Preview;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private previewPane: HTMLElement;
  private previewMaterial: THREE.ShaderMaterial | null = null;
  private controls: OrbitControls;

  private worker: Worker;
  private currentTaskId: number = 0;

  constructor(private camera: THREE.PerspectiveCamera) {
    // Load documents from localStorage
    try {
      const savedDocs = localStorage.getItem('documents');
      if (savedDocs) {
        // Parse documents from localStorage
        this.documents = JSON.parse(savedDocs);

        // Ensure editorState is undefined for all loaded documents
        // There was a bug where we stored editorState in localstorage, and removing it
        // will guarantee that we'll recreate it when the document is activated.
        this.documents.forEach((doc) => {
          doc.editorState = undefined;
        });
      }

      const activeId = localStorage.getItem('activeDocumentId');
      if (activeId && this.documents.find((d) => d.id === activeId)) {
        this.activeDocumentId = activeId;
      }
    } catch (e) {
      console.error('Error loading documents:', e);
    }

    // Create default document if none exist
    if (this.documents.length === 0) {
      this.createNewDocument();
    }

    // Ensure we have an active document
    if (!this.activeDocumentId || !this.documents.find((d) => d.id === this.activeDocumentId)) {
      this.activeDocumentId = this.documents[0].id;
    }
    this.previewPane = document.getElementById('preview-pane')!;
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.previewPane.appendChild(this.renderer.domElement);

    // Initialize worker
    this.worker = new Worker(new URL('./worker/mesh-worker.ts', import.meta.url), {
      type: 'module',
    });

    // Set up generic message handler
    this.worker.onmessage = (e: MessageEvent) => {
      // Ignore messages from old tasks
      if (e.data.taskId !== this.currentTaskId) return;

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

        // Hide spinner when mesh generation completes
        const spinnerOverlay = document.getElementById('spinner-overlay');
        if (spinnerOverlay) {
          spinnerOverlay.classList.add('hidden');
        }

        // Update the view with the new mesh if we're in mesh mode
        if (this.viewMode === ViewMode.Mesh) {
          this.setViewMode(ViewMode.Mesh);
        }
      }
    };

    // Set up generic error handler
    this.worker.onerror = (error: ErrorEvent) => {
      console.error('Mesh generation worker error:', error);
      this.cancelCurrentOperation();
      const progressElement = this.previewPane.querySelector('.mesh-progress');
      if (progressElement) {
        progressElement.remove();
      }
    };

    // Initialize OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 0.1;
    this.controls.maxDistance = 1000.0;
    this.controls.target.set(0, 0, 0);
    this.controls.enablePan = true;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    this.controls.addEventListener('change', () => {
      // Update camera state in current document when controls change
      // And save it to localStorage immediately
      this.saveCurrentCameraState();
      this.saveDocuments();
    });
    this.controls.update();

    // Restore camera position from active document if available
    const activeDoc = this.documents.find((d) => d.id === this.activeDocumentId);
    if (activeDoc?.cameraState) {
      this.restoreCameraState(activeDoc);
    }

    // Set up initial size
    this.updateSize();

    // Handle window resize
    window.addEventListener('resize', () => this.updateSize());

    // Start render loop
    this.animate();

    // Set initial view mode and update shader
    this.setViewMode(ViewMode.Preview);
    this.updateShader();
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

    // Update controls
    this.controls.update();

    // Update shader uniforms if in preview mode
    if (this.viewMode === ViewMode.Preview) {
      const previewMaterial = this.previewMaterial;
      if (!previewMaterial) {
        console.warn('No preview material found in scene');
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
  };

  private setupMeshView() {
    // Add lighting to match preview shader
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2); // 0.2 ambient term from shader
    this.scene.add(ambientLight);

    // Main directional light matching shader's vec3(1,1,1) direction
    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8); // 0.8 diffuse term from shader
    mainLight.position.set(1, 1, 1);
    this.scene.add(mainLight);

    // Create background plane with same shader as preview mode
    const planeGeometry = new THREE.PlaneGeometry(2, 2);
    const planeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        resolution: {
          value: new THREE.Vector2(this.previewPane.clientWidth, this.previewPane.clientHeight),
        },
        customCameraPosition: { value: this.camera.position },
        customViewMatrix: { value: this.camera.matrixWorldInverse },
        projectionMatrix: { value: this.camera.projectionMatrix },
      },
      depthWrite: false,
      depthTest: false,
      vertexShader: `
        void main() {
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec2 resolution;
        uniform vec3 customCameraPosition;
        uniform mat4 customViewMatrix;
        uniform mat4 projectionMatrix;

        vec3 getRayDirection(vec2 uv, vec3 camPos, mat4 viewMatrix) {
          vec2 ndc = (uv * 2.0 - 1.0);
          float aspect = resolution.x / resolution.y;
          vec3 rayView = vec3(ndc.x * aspect, ndc.y, -1.0);
          mat3 viewToWorld = mat3(inverse(viewMatrix));
          return normalize(viewToWorld * rayView);
        }

        void main() {
          vec2 uv = gl_FragCoord.xy / resolution.xy;
          vec3 rd = getRayDirection(uv, customCameraPosition, customViewMatrix);
          vec3 background = normalize(rd) * 0.5 + 0.5;
          background *= background;
          gl_FragColor = vec4(background, 1.0);
        }
      `,
    });
    const backgroundPlane = new THREE.Mesh(planeGeometry, planeMaterial);
    backgroundPlane.frustumCulled = false;
    backgroundPlane.renderOrder = -1; // Ensure background renders first
    this.scene.add(backgroundPlane);

    if (this.currentMesh) {
      // Add mesh to scene
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(this.currentMesh.vertices, 3)
      );
      geometry.setIndex(this.currentMesh.indices);

      // Compute vertex normals for proper lighting
      geometry.computeVertexNormals();

      // Create two meshes - one solid, one wireframe
      const solidMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff, // Full white to match shader
        roughness: 1.0, // Perfectly diffuse
        metalness: 0.0, // No metallic reflections
        side: THREE.DoubleSide,
        depthWrite: true,
        depthTest: true,
        transparent: false,
        flatShading: false, // Enable smooth shading
      });

      const wireframeMaterial = new THREE.LineBasicMaterial({
        color: 0x000000,
        linewidth: 1,
      });

      // Create solid mesh
      const solidMesh = new THREE.Mesh(geometry, solidMaterial);
      solidMesh.userData.isMeshObject = true;
      solidMesh.renderOrder = 1;
      solidMesh.position.z = 0.01;
      this.scene.add(solidMesh);

      // Create wireframe mesh
      const wireframe = new THREE.WireframeGeometry(geometry);
      const wireframeMesh = new THREE.LineSegments(wireframe, wireframeMaterial);
      wireframeMesh.renderOrder = 2; // Ensure wireframe renders on top
      wireframeMesh.position.z = 0.01;
      this.scene.add(wireframeMesh);
    }
  }

  setViewMode(mode: ViewMode) {
    console.log('Setting view mode to:', mode);
    this.viewMode = mode;

    // Clear scene
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }

    // Set up scene based on mode
    if (mode === ViewMode.Preview) {
      // Create a full-screen quad for raymarching
      const planeGeometry = new THREE.PlaneGeometry(2, 2);
      // Create or update preview material
      this.previewMaterial = new THREE.ShaderMaterial({
        uniforms: {
          resolution: {
            value: new THREE.Vector2(this.previewPane.clientWidth, this.previewPane.clientHeight),
          },
          fov: { value: 75.0 },
          customCameraPosition: { value: this.camera.position },
          customViewMatrix: { value: this.camera.matrixWorldInverse },
          projectionMatrix: { value: this.camera.projectionMatrix },
        },
        vertexShader: `
          void main() {
            gl_Position = vec4(position, 1.0);
          }
        `,
        fragmentShader:
          this.currentShader || 'void main() { gl_FragColor = vec4(0.5, 0.5, 0.5, 1.0); }',
      });
      const previewPlane = new THREE.Mesh(planeGeometry, this.previewMaterial);
      previewPlane.frustumCulled = false; // Ensure plane is always rendered
      this.scene.add(previewPlane);
    } else if (mode === ViewMode.Mesh) {
      this.setupMeshView();
    }
  }

  getViewMode(): ViewMode {
    return this.viewMode;
  }

  createNewDocument() {
    // Save camera state of current document before creating new one
    if (this.activeDocumentId) {
      this.saveCurrentCameraState();

      // Also save current editor state to the current document
      const currentDoc = this.documents.find((d) => d.id === this.activeDocumentId);
      if (currentDoc && window._editor) {
        currentDoc.editorState = window._editor.state;
      }
    }

    const id = crypto.randomUUID();
    const num = this.documents.length + 1;
    const doc: Document = {
      id,
      name: `model${num}`,
      content: `translate([-5, 0, 5]) sphere(1);
translate([0, 0, 5]) cube(1.5);
translate([5, 0, 5]) cylinder(radius=1, height=1.5);

translate([-5, 0, 0]) union() { sphere(1); translate([0, 0, 1]) cube(1.4); }
translate([0, 0, 0]) difference() { sphere(1.2); translate([0, 0, 0.8]) cube(1.6); }
translate([5, 0, 0]) intersection() { sphere(1.2); translate([0, 0, 0]) cube(1.8); }

translate([-5, 0, -5]) smooth_union(0.1) { sphere(1); translate([0, 0, 1]) cube(1.4); }

translate([0, 0, -5]) smooth_difference(0.1) {
  sphere(1.2);
  translate([0, 0, 0.8]) cube(1.6);
}

translate([5, 0, -5]) smooth_intersection(0.1) {
  sphere(1.2);
  translate([0, 0, 0]) cube(1.8);
}`,
      cameraState: {
        position: {
          x: 4,
          y: 7,
          z: 12, // see all examples
        },
        target: {
          x: 0,
          y: 0,
          z: 0,
        },
      },
      // editorState will be created when the document is first activated
    };
    this.documents.push(doc);
    this.saveDocuments();
    return id;
  }

  private prepareDocumentsForStorage(): Omit<Document, 'editorState'>[] {
    // Create a deep copy of documents without the editorState property
    return this.documents.map((doc) => {
      // Destructure to omit editorState
      const { editorState, ...docWithoutEditorState } = doc;
      return docWithoutEditorState;
    });
  }

  private saveDocuments() {
    // Save camera state of current document before saving
    if (this.activeDocumentId) {
      this.saveCurrentCameraState();
    }

    // Save documents without editor state
    localStorage.setItem('documents', JSON.stringify(this.prepareDocumentsForStorage()));
    localStorage.setItem('activeDocumentId', this.activeDocumentId || '');
  }

  // Public method to save documents, can be called from outside
  saveDocumentsToLocalStorage() {
    this.saveDocuments();
  }

  private saveCurrentCameraState() {
    const activeDoc = this.getActiveDocument();
    if (!activeDoc) return;

    // Get orbit controls target
    const target = this.controls.target;

    activeDoc.cameraState = {
      position: {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
      },
      target: {
        x: target.x,
        y: target.y,
        z: target.z,
      },
    };
  }

  private restoreCameraState(doc: Document) {
    if (!doc.cameraState) {
      return;
    }

    // Restore position
    this.camera.position.set(
      doc.cameraState.position.x,
      doc.cameraState.position.y,
      doc.cameraState.position.z
    );

    // Restore orbit controls target if available
    if (doc.cameraState.target && this.controls) {
      this.controls.target.set(
        doc.cameraState.target.x,
        doc.cameraState.target.y,
        doc.cameraState.target.z
      );

      // Make sure camera and controls are fully updated
      this.camera.lookAt(this.controls.target);
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld();
      this.controls.update();
    }
  }

  getDocuments(): Document[] {
    return this.documents;
  }

  getActiveDocument(): Document {
    const doc = this.documents.find((d) => d.id === this.activeDocumentId);
    if (!doc) throw Error('we got into a situation with no active document!!');
    return doc;
  }

  setActiveDocument(id: string) {
    // Save camera state of current document before switching
    if (this.activeDocumentId) {
      this.saveCurrentCameraState();

      // Also save current editor state to the current document
      const currentDoc = this.documents.find((d) => d.id === this.activeDocumentId);
      if (currentDoc && window._editor) {
        currentDoc.editorState = window._editor.state;
      }
    }

    const doc = this.documents.find((d) => d.id === id);
    if (doc) {
      this.activeDocumentId = id;

      // Restore camera state for the new document
      if (doc.cameraState) {
        this.restoreCameraState(doc);
      }

      // Restore editor state if it exists, or create a new one
      if (window._editor) {
        if (doc.editorState) {
          // Use the stored editor state (with its history)
          window._editor.setState(doc.editorState);
        } else {
          // Create a new state with the document content (no history)
          const state = EditorState.create({
            doc: doc.content,
            extensions: window.createEditorExtensions!(),
          });
          window._editor.setState(state);
        }
      }

      this.saveDocuments();
      this.updateShader();
    }
  }

  renameDocument(id: string, newName: string) {
    const doc = this.documents.find((d) => d.id === id);
    if (doc) {
      doc.name = newName;
      this.saveDocuments();
    }
  }

  removeDocument(id: string) {
    const index = this.documents.findIndex((d) => d.id === id);
    if (index !== -1) {
      const wasActive = this.activeDocumentId === id;
      this.documents.splice(index, 1);

      if (wasActive) {
        // Switch to the previous document
        this.activeDocumentId = this.documents[Math.max(0, index - 1)]?.id || null;

        // If we have a new active document
        if (this.activeDocumentId) {
          // Find the document
          const newActiveDoc = this.documents.find((d) => d.id === this.activeDocumentId);

          // Restore editor state if available
          if (window._editor && newActiveDoc) {
            if (newActiveDoc.editorState) {
              window._editor.setState(newActiveDoc.editorState);
            } else {
              // Create a new state with the document content (no history)
              const state = EditorState.create({
                doc: newActiveDoc.content,
                extensions: window.createEditorExtensions!(),
              });
              window._editor.setState(state);
            }
          }

          // Restore camera state if available
          if (newActiveDoc?.cameraState) {
            this.restoreCameraState(newActiveDoc);
          }

          // Update the shader for the new document
          this.updateShader();
        }
      }

      this.saveDocuments();
    }
  }

  updateEditorContent(content: string) {
    const doc = this.getActiveDocument();
    if (content !== doc.content) {
      doc.content = content;
      // Don't need to update editorState here since it's automatically
      // reflected in the current state of the editor
      this.saveDocuments();
      this.updateShader();
      // Switch back to preview mode when content changes
      if (this.viewMode === ViewMode.Mesh) {
        this.setViewMode(ViewMode.Preview);
      }
    }
  }

  handleResize(): void {
    this.updateSize();
  }

  private updateShader() {
    const editor = window._editor;
    const editorContent = this.getActiveDocument().content;
    try {
      const cadAst = parseCAD(editorContent);
      const sdfScene = moduleToSDF(cadAst);
      const sdfNode = parseSDF(sdfScene.expr);
      // Get current rainbow mode setting
      const rainbowMode = localStorage.getItem('fncad-rainbow-mode') !== 'false';
      this.currentShader = generateShader(sdfNode, { rainbowMode });

      // Update preview material if it exists
      if (this.previewMaterial) {
        this.previewMaterial.fragmentShader = this.currentShader;
        this.previewMaterial.needsUpdate = true;
      }

      // Clear any existing error decorations
      if (editor) {
        editor.dispatch({
          effects: [errorDecorationFacet.of([])],
        });
      }
    } catch (err) {
      if (err instanceof ParseError) {
        if (editor) {
          const from =
            editor.state.doc.line(err.location.start.line).from + err.location.start.column - 1;
          const to =
            editor.state.doc.line(err.location.end.line).from + err.location.end.column - 1;

          editor.dispatch({
            effects: [
              errorDecorationFacet.of([
                {
                  from,
                  to,
                  error: err.message,
                },
              ]),
            ],
          });
        }
        return;
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

  generateMesh(): Promise<void> {
    // Show spinner when starting mesh generation
    const spinnerOverlay = document.getElementById('spinner-overlay');
    if (spinnerOverlay) {
      spinnerOverlay.classList.remove('hidden');
    }

    this.meshGenerationInProgress = true;
    this.setViewMode(ViewMode.Mesh);
    const taskId = ++this.currentTaskId;

    return new Promise<void>((resolve, reject) => {
      // Set up a one-time message handler for this specific task
      const messageHandler = (e: MessageEvent) => {
        // Ignore messages from old tasks
        if (e.data.taskId !== taskId) return;

        if (e.data.type === 'complete') {
          this.worker.removeEventListener('message', messageHandler);
          resolve();
        } else if (e.data.type === 'error') {
          this.worker.removeEventListener('message', messageHandler);
          reject(new Error(e.data.error));
        }
      };

      this.worker.addEventListener('message', messageHandler);

      this.worker.postMessage({
        type: 'start',
        taskId: taskId,
        code: this.getActiveDocument().content,
      });
    });
  }

  cancelCurrentOperation(): void {
    // Don't terminate the worker, just increment the task ID to ignore old messages
    ++this.currentTaskId;
    this.meshGenerationInProgress = false;

    // Hide spinner when operation is canceled
    const spinnerOverlay = document.getElementById('spinner-overlay');
    if (spinnerOverlay) {
      spinnerOverlay.classList.add('hidden');
    }

    this.setViewMode(ViewMode.Preview);
  }

  setMeshGenerationInProgress(inProgress: boolean) {
    this.meshGenerationInProgress = inProgress;
  }

  isMeshGenerationInProgress(): boolean {
    return this.meshGenerationInProgress;
  }

  refreshPreview(): void {
    if (this.viewMode === ViewMode.Preview) {
      // Re-update the shader with current settings
      this.updateShader();
    }
  }

  resetCameraPosition(): void {
    // Reset to default viewing position
    this.camera.position.set(0, 0, 5);
    this.controls.target.set(0, 0, 0);
    this.camera.lookAt(this.controls.target);
    this.controls.update();

    // Save this reset position to the current document
    this.saveCurrentCameraState();
  }
}

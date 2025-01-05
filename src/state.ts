import * as THREE from 'three';
import { parse as parseCAD } from './cad/parser';
import { moduleToSDF } from './cad/builtins';
import { parse as parseSDF } from './sdf_expressions/parser';
import { generateShader } from './shader';
import { ParseError } from './cad/errors';
import { errorDecorationFacet } from './main';
import { SerializedMesh } from './types';
import { OrbitControls } from 'three/addons/controls/OrbitControls';

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
  private controls: OrbitControls;

  constructor(
    private camera: THREE.PerspectiveCamera
  ) {
    this.previewPane = document.getElementById('preview-pane')!;
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.previewPane.appendChild(this.renderer.domElement);

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
      RIGHT: THREE.MOUSE.PAN
    };
    this.controls.update();

    // Set up initial size
    this.updateSize();

    // Handle window resize
    window.addEventListener('resize', () => this.updateSize());

    // Start render loop
    this.animate();

    // Set initial view mode
    this.setViewMode(ViewMode.Preview);
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

  private setupMeshView() {
    if (!this.currentMesh) {
      console.warn("No mesh data available");
      return;
    }

    console.log("Setting up mesh mode with vertices:", this.currentMesh.vertices.length / 3);
    console.log("First few vertices:", this.currentMesh.vertices.slice(0, 9));
    console.log("First few indices:", this.currentMesh.indices.slice(0, 9));
    
    // Add mesh to scene
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.currentMesh.vertices, 3));
    geometry.setIndex(this.currentMesh.indices);
    
    // Compute vertex normals for proper lighting
    geometry.computeVertexNormals();
    
    console.log("Created geometry with attributes:", geometry.attributes);
    console.log("Index count:", geometry.index?.count);
    console.log("Normal attribute created:", geometry.attributes.normal !== undefined);

    // Add lighting for mesh view
    const ambientLight = new THREE.AmbientLight(0x808080); // Brighter ambient
    this.scene.add(ambientLight);

    // Key light
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(1, 2, 3);
    this.scene.add(keyLight);

    // Fill light
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-2, 1, -1);
    this.scene.add(fillLight);

    // Back light for rim highlighting
    const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
    backLight.position.set(0, 3, -3);
    this.scene.add(backLight);

    // Create background plane with same shader as preview mode
    const planeGeometry = new THREE.PlaneGeometry(2, 2);
    const planeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        resolution: { value: new THREE.Vector2(this.previewPane.clientWidth, this.previewPane.clientHeight) },
        customCameraPosition: { value: this.camera.position },
        customViewMatrix: { value: this.camera.matrixWorldInverse },
        projectionMatrix: { value: this.camera.projectionMatrix }
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
      `
    });
    const backgroundPlane = new THREE.Mesh(planeGeometry, planeMaterial);
    backgroundPlane.frustumCulled = false;
    backgroundPlane.renderOrder = -1; // Ensure background renders first
    this.scene.add(backgroundPlane);
    console.log("Added background plane with material:", planeMaterial);

    // Add mesh with proper material
    console.log("Creating mesh material");
    const material = new THREE.MeshStandardMaterial({ 
      color: 0xcccccc, // Lighter gray
      roughness: 0.5,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: true,
      depthTest: true,
      transparent: false,
      flatShading: false // Enable smooth shading
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.isMeshObject = true;
    mesh.renderOrder = 1; // Ensure mesh renders after background
    mesh.position.z = 0.01; // Slight offset to avoid z-fighting
    console.log("Mesh material:", material);
    console.log("Mesh geometry:", geometry);
    console.log("Mesh position:", mesh.position);
    this.scene.add(mesh);
    console.log("Added mesh to scene, total children:", this.scene.children.length);
  }

  setViewMode(mode: ViewMode) {
    console.log("Setting view mode to:", mode);
    this.viewMode = mode;
    
    // Clear scene
    while(this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
    
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
    } else if (mode === ViewMode.Mesh) {
      this.setupMeshView();
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

      // Update preview material if it exists
      if (this.previewMaterial) {
        this.previewMaterial.fragmentShader = this.currentShader;
        this.previewMaterial.needsUpdate = true;
      }

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
        
        // Update the view with the new mesh if we're in mesh mode
        if (this.viewMode === ViewMode.Mesh) {
          this.setViewMode(ViewMode.Mesh);
        }
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

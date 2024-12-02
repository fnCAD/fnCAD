import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OctreeNode } from '../octree';
import { SerializedMesh } from '../types';
import { TaskProgress } from '../workers/task_types';
import { OctreeRenderSettings, visualizeOctree } from '../octreevis';

export class RendererManager {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  scene: THREE.Scene;
  previewOverlayScene: THREE.Scene;
  previewRenderTarget: THREE.WebGLRenderTarget;
  private material: THREE.ShaderMaterial;
  private quad: THREE.Mesh;

  private readonly FOV = 45;

  private taskInfo: HTMLDivElement;
  private taskProgress: HTMLDivElement;
  private progressBar: HTMLDivElement;

  constructor(private previewPane: HTMLElement) {
    this.taskInfo = document.querySelector('.task-info')!;
    this.taskProgress = document.querySelector('.task-progress')!;
    this.progressBar = this.createProgressBar();
    
    // Initialize task progress bar
    const bar = document.createElement('div');
    bar.className = 'bar';
    this.taskProgress.appendChild(bar);
    // Initialize scenes
    this.scene = new THREE.Scene();
    this.previewOverlayScene = new THREE.Scene();

    // Add lighting for mesh visualization
    const ambientLight = new THREE.AmbientLight(0x404040);
    this.previewOverlayScene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 2, 3);
    this.previewOverlayScene.add(directionalLight);

    // Create progress bar
    this.progressBar = this.createProgressBar();
    previewPane.appendChild(this.progressBar);

    // Initialize renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(previewPane.clientWidth, previewPane.clientHeight);
    this.renderer.setClearColor(0x000000, 0);
    previewPane.appendChild(this.renderer.domElement);

    // Initialize camera
    this.camera = new THREE.PerspectiveCamera(
      this.FOV,
      previewPane.clientWidth / previewPane.clientHeight,
      0.1,
      1000.0
    );
    this.camera.position.set(3, 2, 3);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);

    // Initialize controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.setupControls();

    // Create render target
    this.previewRenderTarget = this.createRenderTarget();

    // Set up raymarching quad
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        resolution: { value: new THREE.Vector2(previewPane.clientWidth, previewPane.clientHeight) },
        customViewMatrix: { value: this.camera.matrixWorldInverse },
        projectionMatrix: { value: this.camera.projectionMatrix },
        customCameraPosition: { value: this.camera.position },
        fov: { value: this.FOV },
        previewSceneBuffer: { value: this.previewRenderTarget.texture },
        previewSceneDepth: { value: this.previewRenderTarget.depthTexture }
      },
      vertexShader: `
        void main() {
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        void main() {
          gl_FragColor = vec4(0.2, 0.2, 0.2, 1.0);
        }
      ` // Default shader until real one is provided
    });
    this.quad = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.quad);

    // Add coordinate axes helper
    const axesHelper = new THREE.AxesHelper(2);
    this.previewOverlayScene.add(axesHelper);

    // Handle window resize
    window.addEventListener('resize', this.handleResize.bind(this));
  }

  private createProgressBar(): HTMLDivElement {
    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    bar.style.display = 'none';
    return bar;
  }

  updateProgress(progress: TaskProgress) {
    const bar = this.taskProgress.querySelector('.bar') as HTMLDivElement;
    
    // Always ensure progress elements are in the DOM
    this.taskProgress.style.display = 'block';
    
    if (progress.status === 'running') {
      const taskType = progress.type === 'octree' ? 'Building Octree' : 'Generating Mesh';
      const percent = Math.round(progress.progress * 100);
      this.taskInfo.textContent = `${taskType}: ${percent}%`;
      bar.style.width = `${percent}%`;
    } else if (progress.status === 'completed') {
      const taskType = progress.type === 'octree' ? 'Octree' : 'Mesh';
      this.taskInfo.textContent = `${taskType} Complete ✓`;
      bar.style.width = '100%';
      setTimeout(() => {
        this.taskInfo.textContent = '';
        this.taskProgress.style.display = 'none';
        bar.style.width = '0';
      }, 3000);
    } else if (progress.status === 'failed') {
      this.taskInfo.textContent = `Error: ${progress.error || 'Task failed'} ✗`;
      bar.style.width = '100%';
      bar.style.background = '#ff4444';
      setTimeout(() => {
        this.taskInfo.textContent = '';
        this.taskProgress.style.display = 'none';
        bar.style.width = '0';
        bar.style.background = ''; // Reset to default gradient
      }, 5000);
    }
  }

  private setupControls() {
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
  }

  private createRenderTarget(): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(
      this.previewPane.clientWidth,
      this.previewPane.clientHeight,
      {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
        depthBuffer: true,
        depthTexture: new THREE.DepthTexture(
          this.previewPane.clientWidth,
          this.previewPane.clientHeight,
          THREE.FloatType
        ),
        stencilBuffer: false,
        colorSpace: THREE.LinearSRGBColorSpace
      }
    );
  }

  private handleResize() {
    const width = this.previewPane.clientWidth;
    const height = this.previewPane.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    
    // Update render target size
    this.previewRenderTarget.dispose();
    this.previewRenderTarget = this.createRenderTarget();

    // Update uniforms
    this.material.uniforms.resolution.value.set(width, height);
  }

  render() {
    this.controls.update();

    // Update all uniforms every frame
    const width = this.previewPane.clientWidth;
    const height = this.previewPane.clientHeight;
    
    this.material.uniforms.resolution.value.set(width, height);
    this.material.uniforms.customViewMatrix.value.copy(this.camera.matrixWorldInverse);
    this.material.uniforms.projectionMatrix.value.copy(this.camera.projectionMatrix);
    this.material.uniforms.customCameraPosition.value.copy(this.camera.position);
    this.material.uniforms.fov.value = this.FOV;
    this.material.uniforms.previewSceneBuffer.value = this.previewRenderTarget.texture;
    this.material.uniforms.previewSceneDepth.value = this.previewRenderTarget.depthTexture;

    // Render preview scene to texture only
    this.renderer.setRenderTarget(this.previewRenderTarget);
    this.renderer.clear();
    this.renderer.render(this.previewOverlayScene, this.camera);
    
    // Only render raymarching if enabled
    if (this.quad.visible) {
      this.renderer.setRenderTarget(null);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
    }
  }

  updateShader(fragmentShader: string, visible: boolean = true) {
    // When invisible, modify the scene() function to return inf
    const modifiedShader = visible ? fragmentShader : 
      fragmentShader.replace(
        /float scene\(vec3 pos\) {([^}]*)}/s,
        'float scene(vec3 pos) {\n  return 1.0e10;\n}'
      );
    
    // Update shader code
    this.material.fragmentShader = modifiedShader;
    this.material.needsUpdate = true;
    
    // Force recompilation
    this.material.uniformsNeedUpdate = true;
    
    // Check for shader compilation errors
    const gl = this.renderer.getContext();
    const program = (this.material as any).program;
    if (program && program.fragmentShader) {
      const status = gl.getShaderParameter(program.fragmentShader, gl.COMPILE_STATUS);
      if (!status) {
        const error = gl.getShaderInfoLog(program.fragmentShader);
        console.error('Shader compilation failed:', error);
      } else {
        console.log('Shader compiled successfully');
      }
    }
  }

  getFOV(): number {
    return this.FOV;
  }

  updateOctreeVisualization(octree: OctreeNode, settings: OctreeRenderSettings, visible: boolean = true) {

    // Remove existing octree visualization
    this.previewOverlayScene.children = this.previewOverlayScene.children.filter(child => 
      !(child instanceof THREE.Group && child.userData.isOctreeVisualization)
    );

    // Create new visualization only if visible
    if (visible) {
      const octreeGroup = visualizeOctree(octree, settings);
      if (octreeGroup) {
        octreeGroup.userData.isOctreeVisualization = true;
        this.previewOverlayScene.add(octreeGroup);
      } else {
        console.warn('visualizeOctree returned null');
      }
    }
  }

  updateMesh(meshData: SerializedMesh | null) {
    // Remove existing mesh
    // Remove existing SDF mesh
    const existingMesh = this.previewOverlayScene.children.find(
      child => child instanceof THREE.Mesh && child.userData.isSdfMesh
    ) as THREE.Mesh | undefined;
    
    if (existingMesh) {
      existingMesh.geometry.dispose();
      if (Array.isArray(existingMesh.material)) {
        existingMesh.material.forEach(m => m.dispose());
      } else {
        existingMesh.material.dispose();
      }
      this.previewOverlayScene.remove(existingMesh);
    }

    if (meshData) {
      const geometry = new THREE.BufferGeometry();
      
      // Set vertices
      geometry.setAttribute('position', 
        new THREE.Float32BufferAttribute(meshData.vertices, 3));
      
      // Set indices
      geometry.setIndex(meshData.indices);
      
      // Always compute normals
      geometry.computeVertexNormals();
      
      const material = new THREE.MeshPhongMaterial({
        color: 0xffd700,
        side: THREE.DoubleSide,
        flatShading: true,
        emissive: 0x222222,
        shininess: 30,
        transparent: true,
        opacity: 0.8
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.isSdfMesh = true;
      this.previewOverlayScene.add(mesh);
    }
  }
}

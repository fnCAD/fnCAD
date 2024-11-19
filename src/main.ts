import './style.css'
import Split from 'split.js'
import { getRuntimeBasePath } from './utils/runtime-base'

// Set runtime base path for assets
const BASE_PATH = getRuntimeBasePath();

// Configure Monaco's base path for worker loading
(window as any).MonacoEnvironment = {
  getWorkerUrl: function(_moduleId: string, label: string) {
    return `${BASE_PATH}${label}.worker.js`;
  }
};
import * as monaco from 'monaco-editor'
import * as THREE from 'three'
import { downloadSTL } from './stlexporter'
import { OctreeNode } from './octree'
import { OctreeRenderSettings, visualizeOctree } from './octreevis'
import { MeshGenerator } from './meshgen'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { parse } from './sdf_expressions/parser'
import { generateShader } from './shader'

// Initialize split panes
Split(['#editor-pane', '#preview-pane'], {
  sizes: [50, 50],
  minSize: [300, 300],
  gutterSize: 8,
})

// Initialize Monaco editor
const editor = monaco.editor.create(document.getElementById('editor-pane')!, {
  // Store editor instance for later use with shader compilation
  value: `// Scene with two spheres
sphere(1.0);
translate(2, 0, 0) {
  sphere(0.7);
}`,
  language: 'typescript',
  theme: 'vs-dark',
  minimap: { enabled: false },
  automaticLayout: true,
});

// Add change listener to update shader
editor.onDidChangeModelContent(() => {
  updateOctree();
  updateMaterial();
});

// Store editor instance for later use with shader compilation
window._editor = editor;

// Get preview pane element
const previewPane = document.getElementById('preview-pane')!;

// Set up Three.js scenes:
// - scene: Used only for raymarching quad, DO NOT add other geometry here as it won't be visible
// - previewOverlayScene: Used for debug visualization (octree, mesh preview, etc)
const scene = new THREE.Scene();
const previewOverlayScene = new THREE.Scene();

// Add lighting for mesh visualization
const ambientLight = new THREE.AmbientLight(0x404040);
previewOverlayScene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(1, 2, 3);
previewOverlayScene.add(directionalLight);
let currentOctree: OctreeNode | null = null;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(previewPane.clientWidth, previewPane.clientHeight);
renderer.setClearColor(0x000000, 0); // Clear to transparent black
previewPane.innerHTML = '';
previewPane.appendChild(renderer.domElement);

// Add stats panel
const statsPanel = document.createElement('div');
statsPanel.id = 'stats-panel';
statsPanel.textContent = 'Octree cells: 0';
previewPane.appendChild(statsPanel);

// Add settings panel
const settingsPanel = document.createElement('div');
settingsPanel.id = 'settings-panel';
settingsPanel.innerHTML = `
  <h3>Settings</h3>
  <div class="settings-content">
    <div class="setting-row">
      <input type="checkbox" id="show-octree" checked>
      <label for="show-octree">Show Octree Grid</label>
    </div>
    <div class="setting-row">
      <input type="checkbox" id="show-outside" checked>
      <label for="show-outside">Show Outside Cells</label>
    </div>
    <div class="setting-row">
      <input type="checkbox" id="show-inside" checked>
      <label for="show-inside">Show Inside Cells</label>
    </div>
    <div class="setting-row">
      <input type="checkbox" id="show-boundary" checked>
      <label for="show-boundary">Show Boundary Cells</label>
    </div>
    <div class="setting-group">
      <h4>Octree Computation</h4>
      <div class="setting-row">
        <label for="min-size">Min Cell Size:</label>
        <input type="range" id="min-size" min="0" max="6" step="1" value="0">
        <span class="value-display">1</span>
      </div>
      <div class="setting-row">
        <label for="cell-budget">Cell Budget:</label>
        <input type="range" id="cell-budget" min="1000" max="1000000" step="1000" value="100000">
        <span class="value-display">100000</span>
      </div>
    </div>
    <div class="setting-group">
      <h4>Visualization</h4>
      <div class="setting-row">
        <label for="min-render-size">Min Render Size:</label>
        <input type="range" id="min-render-size" min="0" max="6" step="1" value="0">
        <span class="value-display">1</span>
      </div>
    </div>
    <div class="setting-row">
      <input type="checkbox" id="optimize-mesh" checked>
      <label for="optimize-mesh">Optimize Mesh</label>
    </div>
    <div class="setting-row">
      <button id="generate-mesh">Generate Mesh</button>
    </div>
  </div>
`;
previewPane.appendChild(settingsPanel);

// Add settings panel collapse behavior
const settingsHeader = settingsPanel.querySelector('h3')!;
settingsHeader.addEventListener('click', () => {
  settingsPanel.classList.toggle('collapsed');
});

// Add visibility controls
const showOctreeCheckbox = document.getElementById('show-octree') as HTMLInputElement;
const showOutsideCheckbox = document.getElementById('show-outside') as HTMLInputElement;
const showInsideCheckbox = document.getElementById('show-inside') as HTMLInputElement;
const showBoundaryCheckbox = document.getElementById('show-boundary') as HTMLInputElement;

function updateOctreeGeometry() {
  // Always call visualization update - it handles the checkbox state internally
  updateOctreeVisualization();
}

[showOctreeCheckbox, showOutsideCheckbox, showInsideCheckbox, showBoundaryCheckbox].forEach(checkbox => {
  checkbox.addEventListener('change', updateOctreeGeometry);
});

// Create render target for preview scene
const previewRenderTarget = new THREE.WebGLRenderTarget(
  previewPane.clientWidth, 
  previewPane.clientHeight,
  {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
    depthBuffer: true,
    depthTexture: new THREE.DepthTexture(
      previewPane.clientWidth,
      previewPane.clientHeight,
      THREE.FloatType
    ),
    stencilBuffer: false,
    colorSpace: THREE.LinearSRGBColorSpace
  }
);

// Add coordinate axes helper to preview scene
const overlayAxesHelper = new THREE.AxesHelper(2);
previewOverlayScene.add(overlayAxesHelper);
const FOV = 45; // Narrower FOV for better perspective
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000);
// Set up camera for proper orbit viewing
camera.position.set(3, 2, 3);
camera.up.set(0, 1, 0);  // Ensure up vector is aligned with Y axis
camera.lookAt(0, 0, 0);


// Add orbit controls
const controls = new OrbitControls(camera, renderer.domElement);
// Configure orbit controls
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.minDistance = 1;
controls.maxDistance = 100;
controls.target.set(0, 0, 0);
controls.enablePan = true;      // Enable panning
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,    // Left button rotates
  MIDDLE: THREE.MOUSE.DOLLY,   // Middle button zooms
  RIGHT: THREE.MOUSE.PAN       // Right button pans
};
controls.update();

// Set up raymarching quad
const geometry = new THREE.PlaneGeometry(2, 2);
let material = new THREE.ShaderMaterial({
  uniforms: {
    resolution: { value: new THREE.Vector2(previewPane.clientWidth, previewPane.clientHeight) },
    customViewMatrix: { value: camera.matrixWorldInverse },
    customCameraPosition: { value: camera.position },
    fov: { value: FOV },
    previewSceneBuffer: { value: previewRenderTarget.texture },
    previewSceneDepth: { value: previewRenderTarget.depthTexture }
  },
  fragmentShader: generateShader(parse(editor.getValue())),
  vertexShader: `
    void main() {
      gl_Position = vec4(position, 1.0);
    }
  `
});
const quad = new THREE.Mesh(geometry, material);
scene.add(quad);

// Helper function to update octree visualization
function updateOctreeVisualization() {
  // Remove existing octree visualization first
  previewOverlayScene.children = previewOverlayScene.children.filter(child => 
    !(child instanceof THREE.Group && child.userData.isOctreeVisualization)
  );

  // Early return if visualization is disabled
  if (!showOctreeCheckbox.checked) return;

  const minRenderSize = Math.pow(2, -parseInt(minRenderSizeSlider.value));
  const renderSettings = new OctreeRenderSettings(
    showOutsideCheckbox.checked,
    showInsideCheckbox.checked,
    showBoundaryCheckbox.checked,
    minRenderSize
  );
  
  const octreeGroup = visualizeOctree(currentOctree, renderSettings);
  if (octreeGroup) {
    if (octreeGroup) {
      previewOverlayScene.add(octreeGroup);
    }
  }
}

// Set up computation sliders
const minSizeSlider = document.getElementById('min-size') as HTMLInputElement;
const cellBudgetSlider = document.getElementById('cell-budget') as HTMLInputElement;
const minRenderSizeSlider = document.getElementById('min-render-size') as HTMLInputElement;

minSizeSlider.addEventListener('input', () => {
  const power = parseInt(minSizeSlider.value);
  const value = Math.pow(2, power);  // Use positive power for display
  const minSizeDisplay = minSizeSlider.nextElementSibling as HTMLSpanElement;
  minSizeDisplay.textContent = value === 1 ? '1' : `1/${value}`;
  updateOctree();
  updateOctreeVisualization();
});

cellBudgetSlider.addEventListener('input', () => {
  const value = parseInt(cellBudgetSlider.value);
  const display = cellBudgetSlider.nextElementSibling as HTMLSpanElement;
  display.textContent = value.toString();
  updateOctree();
});

minRenderSizeSlider.addEventListener('input', () => {
  const power = parseInt(minRenderSizeSlider.value);
  const value = Math.pow(2, power);  // Use positive power for display
  const display = minRenderSizeSlider.nextElementSibling as HTMLSpanElement;
  display.textContent = value === 1 ? '1' : `1/${value}`;
  updateOctreeVisualization();
});

// Add initial octree visualization
const initialAst = parse(editor.getValue());
// NOTE: This large initial size (64k) is intentional and should not be changed!
// It provides sufficient resolution for complex shapes while maintaining performance
currentOctree = new OctreeNode(new THREE.Vector3(0, 0, 0), 65536, initialAst);
const power = parseInt(minSizeSlider.value);
const minSize = Math.pow(2, -power);
const cellBudget = parseInt((document.getElementById('cell-budget') as HTMLInputElement).value);
const totalCells = currentOctree.subdivide(minSize, cellBudget);
statsPanel.textContent = `Octree cells: ${totalCells}`;
// Initial visualization
updateOctreeVisualization();


// Function to update the octree visualization
function updateOctree() {
  try {
    const editorContent = editor.getValue();
    const ast = parse(editorContent);

    // Update octree visualization
    if (currentOctree) {
      // Remove existing octree visualization
      previewOverlayScene.children = previewOverlayScene.children.filter(child => 
        !(child instanceof THREE.Group && child.userData.isOctreeVisualization)
      );
    }
    // NOTE: This large initial size (64k) is intentional and should not be changed!
    // It provides sufficient resolution for complex shapes while maintaining performance
    currentOctree = new OctreeNode(new THREE.Vector3(0, 0, 0), 65536, ast);
    
    // Get min size from slider
    const minSizeSlider = document.getElementById('min-size') as HTMLInputElement;
    const power = parseInt(minSizeSlider.value);
    const minSize = Math.pow(2, -power);
    
    // Update display with fraction format
    const value = Math.pow(2, power);  // Use positive power for display
    const minSizeDisplay = minSizeSlider.nextElementSibling as HTMLSpanElement;
    minSizeDisplay.textContent = value === 1 ? '1' : `1/${value}`;
    
    // Create and add new octree with current min size
    const cellBudget = parseInt((document.getElementById('cell-budget') as HTMLInputElement).value);
    const minRenderSize = Math.pow(2, -parseInt(minRenderSizeSlider.value));
    const renderSettings = new OctreeRenderSettings(true, true, true, minRenderSize);
    const totalCells = currentOctree.subdivide(minSize, cellBudget, renderSettings);
    const octreeGroup = visualizeOctree(currentOctree, renderSettings);
    if (octreeGroup) {
      previewOverlayScene.add(octreeGroup);
    }
    
    // Update stats
    const statsPanel = document.getElementById('stats-panel');
    if (statsPanel) {
      statsPanel.textContent = `Octree cells: ${totalCells}`;
    }

    // Update material with new shader
    updateMaterial();
  } catch (e) {
    console.error('Error updating octree:', e);
  }
}

function updateMaterial() {
  try {
    const fragmentShader = generateShader(parse(editor.getValue()));
    material = new THREE.ShaderMaterial({
      uniforms: {
        resolution: { value: new THREE.Vector2(previewPane.clientWidth, previewPane.clientHeight) },
        customViewMatrix: { value: camera.matrixWorldInverse },
        projectionMatrix: { value: camera.projectionMatrix },
        customCameraPosition: { value: camera.position },
        fov: { value: FOV },
        previewSceneBuffer: { value: previewRenderTarget.texture },
        previewSceneDepth: { value: previewRenderTarget.depthTexture }
      },
      fragmentShader,
      vertexShader: material.vertexShader
    });
    quad.material = material;
  } catch (e) {
    if (e instanceof Error) {
      // Check if it's a shader compilation error vs other errors
      if (e.message.includes('WebGLShader')) {
        console.error('WebGL shader compilation failed:', e);
      } else {
        console.error('SDF evaluation error:', e);
      }
    } else {
      console.error('Unknown error:', e);
    }
  }
}

// Handle window resize
window.addEventListener('resize', () => {
  const width = previewPane.clientWidth;
  const height = previewPane.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});


// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();

  // First render octree to texture
  renderer.setRenderTarget(previewRenderTarget);
  renderer.clear(); // Clear previous frame
  renderer.render(previewOverlayScene, camera);
  renderer.setRenderTarget(null);
  
  // Then render main scene
  renderer.render(scene, camera);
}
// Add mesh generation handler
let currentMesh: THREE.Mesh | null = null;
const generateMeshButton = document.getElementById('generate-mesh') as HTMLButtonElement;
generateMeshButton.addEventListener('click', () => {
  console.log('Generate mesh button clicked');
  if (currentMesh) {
    console.log('Removing existing mesh');
    previewOverlayScene.remove(currentMesh);
    currentMesh.geometry.dispose();
    if (currentMesh.material instanceof THREE.Material) {
      currentMesh.material.dispose();
    } else {
      currentMesh.material.forEach(m => m.dispose());
    }
    currentMesh = null;
  }
  if (currentOctree) {
    console.log('Creating mesh generator');
    // Get optimization setting
    const optimize = (document.getElementById('optimize-mesh') as HTMLInputElement).checked;
    const meshGen = new MeshGenerator(currentOctree, optimize);
    currentMesh = meshGen.generate();
    console.log(`Generated mesh with ${currentMesh.geometry.attributes.position.count} vertices`);
    console.log('Adding mesh to scene at position:', currentMesh.position);
    
    // Ensure mesh is visible
    currentMesh.visible = true;
    if (currentMesh.material instanceof THREE.Material) {
      currentMesh.material.needsUpdate = true;
    } else {
      currentMesh.material.forEach(m => m.needsUpdate = true);
    }
    currentMesh.geometry.computeBoundingSphere();
    console.log('Mesh bounds:', currentMesh.geometry.boundingSphere);
    
    previewOverlayScene.add(currentMesh);
  } else {
    console.warn('No octree available for mesh generation');
  }
});

// Add STL export handler
const saveStlButton = document.getElementById('save-stl') as HTMLButtonElement;
saveStlButton.addEventListener('click', () => {
  if (currentMesh) {
    downloadSTL(currentMesh, 'model.stl');
  } else {
    alert('Please generate a mesh first');
  }
});

animate();

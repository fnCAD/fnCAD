import './style.css'
import Split from 'split.js'
import * as monaco from 'monaco-editor'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { parse } from './parser'
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
  value: `// Classic sphere SDF
sqrt(p.x * p.x + p.y * p.y + p.z * p.z) - 1.0`,
  language: 'typescript',
  theme: 'vs-dark',
  minimap: { enabled: false },
  automaticLayout: true,
});

// Store editor instance for later use with shader compilation
window._editor = editor;

// Set up Three.js scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
camera.position.set(0, 0, -4);
camera.lookAt(0, 0, 0);

const previewPane = document.getElementById('preview-pane')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(previewPane.clientWidth, previewPane.clientHeight);
previewPane.innerHTML = '';
previewPane.appendChild(renderer.domElement);

// Add orbit controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.minDistance = 1;
controls.maxDistance = 10;
controls.update();

// Create a full-screen quad for ray marching
const geometry = new THREE.PlaneGeometry(2, 2);
let material = new THREE.ShaderMaterial({
  uniforms: {
    resolution: { value: new THREE.Vector2(previewPane.clientWidth, previewPane.clientHeight) },
    customViewMatrix: { value: camera.matrixWorldInverse },
    customCameraPosition: { value: camera.position }
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

// Handle window resize
window.addEventListener('resize', () => {
  const width = previewPane.clientWidth;
  const height = previewPane.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});

// Update shader when editor content changes
editor.onDidChangeModelContent(() => {
  try {
    const editorContent = editor.getValue();
    console.log('Editor content:', editorContent);
    const ast = parse(editorContent);
    console.log('Parsed AST:', ast);
    const fragmentShader = generateShader(ast);
    console.log('Generated shader:', fragmentShader);
    material = new THREE.ShaderMaterial({
      uniforms: {
        resolution: { value: new THREE.Vector2(previewPane.clientWidth, previewPane.clientHeight) },
        customViewMatrix: { value: camera.matrixWorldInverse },
        customCameraPosition: { value: camera.position }
      },
      fragmentShader,
      vertexShader: material.vertexShader
    });
    quad.material = material;
  } catch (e) {
    console.error('Shader compilation failed:', e);
  }
});

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  
  // Update shader uniforms
  material.uniforms.customViewMatrix.value.copy(camera.matrixWorldInverse);
  material.uniforms.customCameraPosition.value.copy(camera.position);
  
  renderer.render(scene, camera);
}
animate();

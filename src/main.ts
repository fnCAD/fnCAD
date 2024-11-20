import './style.css'
import Split from 'split.js'
import { getRuntimeBasePath } from './utils/runtime-base'
import * as monaco from 'monaco-editor'
import { downloadSTL } from './stlexporter'
import { MeshGenerator } from './meshgen'
import { StateManager } from './managers/state'
import { OctreeManager } from './managers/octree'
import { SettingsManager } from './managers/settings'
import { RendererManager } from './managers/renderer'

// Set runtime base path for assets
const BASE_PATH = getRuntimeBasePath();

// Configure Monaco's base path for worker loading
(window as any).MonacoEnvironment = {
  getWorkerUrl: function(_moduleId: string, label: string) {
    if (label === 'typescript' || label === 'javascript') {
      return '/node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js';
    }
    return '/node_modules/monaco-editor/esm/vs/editor/editor.worker.js';
  }
};

// Initialize split panes
Split(['#editor-pane', '#preview-pane'], {
  sizes: [50, 50],
  minSize: [300, 300],
  gutterSize: 8,
});

// Get preview pane element
const previewPane = document.getElementById('preview-pane')!;

// Initialize managers
const rendererManager = new RendererManager(previewPane);
const stateManager = new StateManager(rendererManager);
const settingsManager = new SettingsManager(previewPane, () => {
  updateOctree();
});
const octreeManager = new OctreeManager(stateManager, rendererManager);

// Initialize Monaco editor
const editor = monaco.editor.create(document.getElementById('editor-pane')!, {
  value: `// Scene with two spheres
sphere(1);
translate(2, 0, 0) {
  sphere(0.7);
}`,
  language: 'typescript',
  theme: 'vs-dark',
  minimap: { enabled: false },
  automaticLayout: true,
});

// Add change listener
editor.onDidChangeModelContent(() => {
  stateManager.updateEditorContent(editor.getValue());
  updateOctree();
});

// Store editor instance for later use
window._editor = editor;

// Initial state update
stateManager.updateEditorContent(editor.getValue());
updateOctree();

// Function to update octree based on current settings
function updateOctree() {
  const ast = stateManager.parseContent();
  stateManager.updateShader(ast);
  octreeManager.updateOctree(
    settingsManager.getMinSize(),
    settingsManager.getCellBudget(),
    settingsManager.getRenderSettings()
  );
}



// Add mesh generation handler
const generateMeshButton = document.getElementById('generate-mesh') as HTMLButtonElement;
generateMeshButton.addEventListener('click', async () => {
  const state = stateManager.getState();
  if (!state.currentOctree) {
    console.warn('No octree available for mesh generation');
    return;
  }

  const taskId = stateManager.taskQueue.addTask({
    type: 'mesh',
    optimize: settingsManager.isMeshOptimizationEnabled(),
    octree: state.currentOctree
  });

  try {
    const task = await new Promise<TaskProgress>((resolve, reject) => {
      const unsubscribe = stateManager.taskQueue.onProgress((progress) => {
        if (progress.taskId === taskId) {
          if (progress.status === 'completed') {
            unsubscribe();
            resolve(progress);
          } else if (progress.status === 'failed') {
            unsubscribe();
            reject(new Error(progress.error));
          }
        }
      });
    });

    if (task.result) {
      stateManager.setCurrentMesh(task.result);
      rendererManager.updateMesh(task.result);
    }
  } catch (error) {
    console.error('Mesh generation failed:', error);
  }
});

// Add STL export handler
const saveStlButton = document.getElementById('save-stl') as HTMLButtonElement;
saveStlButton.addEventListener('click', () => {
  const state = stateManager.getState();
  if (state.currentMesh) {
    downloadSTL(state.currentMesh, 'model.stl');
  } else {
    alert('Please generate a mesh first');
  }
});

// Start animation loop
function animate() {
  requestAnimationFrame(animate);
  rendererManager.render();
}
animate();

import './style.css'
import Split from 'split.js'
import { getRuntimeBasePath } from './utils/runtime-base'
import { downloadSTL } from './stlexporter'
import { StateManager } from './managers/state'
import { TaskProgress } from './workers/task_types'
import { OctreeManager } from './managers/octree'
import { SettingsManager } from './managers/settings'
import { RendererManager } from './managers/renderer'
import { EditorView, ViewUpdate } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { basicSetup } from 'codemirror'
import { oneDark } from '@codemirror/theme-one-dark'

// Set runtime base path for assets
getRuntimeBasePath(); // Initialize runtime base path

// Initialize split panes
Split(['#editor-pane', '#preview-pane'], {
  sizes: [50, 50],
  minSize: [300, 300],
  gutterSize: 8,
});

// Get preview pane element
const previewPane = document.getElementById('preview-pane')!;

// Initialize managers
const settingsManager = new SettingsManager(previewPane, () => {
  updateOctree();
});
const rendererManager = new RendererManager(previewPane, settingsManager);
const stateManager = new StateManager(rendererManager, settingsManager);
const octreeManager = new OctreeManager(stateManager, rendererManager);

// Initialize CodeMirror editor
const editor = new EditorView({
  state: EditorState.create({
    doc: `// Scene with two spheres
sphere(1);
translate(2, 0, 0) {
  sphere(0.7);
}`,
    extensions: [
      basicSetup,
      javascript(),
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged) {
          stateManager.updateEditorContent(update.state.doc.toString());
          updateOctree();
        }
      }),
      oneDark,
      EditorView.theme({
        '&': {height: '100%'},
        '.cm-scroller': {overflow: 'auto'},
        '.cm-gutters': {backgroundColor: 'transparent'},
        '.cm-lineNumbers': {color: '#666'}
      })
    ]
  }),
  parent: document.getElementById('editor-pane')!
});

// Store editor instance for later use
window._editor = editor;

// Initial state update
stateManager.updateEditorContent(editor.state.doc.toString());
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
    octree: state.currentOctree,
    minSize: settingsManager.getMinSize(),
    source: stateManager.getEditorContent()
  });
  
  // Set this as the active task
  stateManager.setActiveTaskId(taskId);

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
      if (task.result && 'vertices' in task.result) {
        stateManager.setCurrentMesh(task.result);
        rendererManager.updateMesh(task.result);
      }
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

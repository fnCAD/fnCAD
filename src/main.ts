import './style.css';

// Add dynamic styles for mesh progress
const style = document.createElement('style');
style.textContent = `
  .mesh-progress {
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    font-family: monospace;
    z-index: 1000;
  }
`;
document.head.appendChild(style);
import Split from 'split.js';
import { getRuntimeBasePath } from './utils/runtime-base';
import { downloadSTL } from './stlexporter';
import { EditorView, ViewUpdate, Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { Parser } from './cad/parser';
import { ParseError } from './cad/errors';
import { getModuleDoc } from './cad/docs';
import { basicSetup } from 'codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import * as THREE from 'three';
import { AppState, ViewMode } from './state';

// Error decoration setup
interface ErrorDecoration {
  from: number;
  to: number;
  error: string;
}

export const errorDecorationFacet = StateEffect.define<ErrorDecoration[]>();
export const callHighlightEffect = StateEffect.define<{ from: number; to: number } | null>();

const callHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(callHighlightEffect)) {
        if (effect.value === null) {
          decorations = Decoration.none;
        } else {
          decorations = Decoration.set([
            Decoration.mark({
              class: 'cm-active-call',
            }).range(effect.value.from, effect.value.to),
          ]);
        }
      }
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// Create help popup element
const helpPopup = document.createElement('div');
helpPopup.className = 'parameter-help';
document.querySelector('#editor-pane')?.appendChild(helpPopup);

// Function to update help popup
function updateHelpPopup(view: EditorView) {
  const pos = view.state.selection.main.head;
  if (!pos) {
    helpPopup.style.display = 'none';
    return;
  }

  // Find module call at current position
  const parser = new Parser(view.state.doc.toString());
  try {
    parser.parse();
  } catch (e) {
    // Only swallow ParseErrors, rethrow everything else
    if (!(e instanceof ParseError)) {
      throw e;
    }
    // Continue with partial locations if parsing fails
  }
  const locations = parser.getLocations();

  // Show help for any call where we're in the parameter list
  for (const call of locations) {
    if (pos >= call.paramRange.start.offset && pos <= call.paramRange.end.offset) {
      // Get documentation
      const doc = getModuleDoc(call.moduleName);

      // Find current parameter
      let currentParamIndex = -1;
      console.log('Checking parameters for position:', pos);
      for (let i = 0; i < call.parameters.length; i++) {
        const param = call.parameters[i];
        console.log('Parameter', i, ':', {
          start: param.range.start.offset,
          end: param.range.end.offset,
          name: param.name,
          value: param.value,
        });
        if (pos >= param.range.start.offset && pos <= param.range.end.offset) {
          console.log('Found matching parameter:', i);
          currentParamIndex = i;
          break;
        }
      }

      // Build help content
      let content = `<strong>${call.moduleName}</strong>(`;
      if (doc) {
        content += doc.parameters
          .map((p, i) => {
            const className = i === currentParamIndex ? 'current' : '';
            const param = call.parameters[i];
            const value = param?.value ? ` = ${param.value}` : '';
            return `<span class="${className}">${p.name}: ${p.type}${value}</span>`;
          })
          .join(', ');
        content += ')<br/>';
        content += `<small>${doc.description}</small>`;

        if (currentParamIndex >= 0 && currentParamIndex < doc.parameters.length) {
          content += `<br/><small>${doc.parameters[currentParamIndex].description}</small>`;
        }
      } else {
        content +=
          call.parameters
            .map((p, i) => {
              const className = i === currentParamIndex ? 'current' : '';
              const value = p.value ? ` = ${p.value}` : '';
              return `<span class="${className}">${p.name || `arg${i}`}${value}</span>`;
            })
            .join(', ') + ')';
      }

      helpPopup.innerHTML = content;

      // Build parameter descriptions
      let paramDescriptions = '';
      if (doc) {
        doc.parameters.forEach((p, i) => {
          const isCurrent = i === currentParamIndex;
          paramDescriptions += `<div class="param-desc ${isCurrent ? 'current' : ''}">
            ${isCurrent ? '<strong>' : ''}${p.name}: ${p.description}${isCurrent ? '</strong>' : ''}
          </div>`;
        });
      }

      // Update content
      helpPopup.innerHTML = `
        <strong>${call.moduleName}</strong>(${
          doc?.parameters
            .map((p, i) => {
              const param = call.parameters[i];
              const value = param?.value ? ` = ${param.value}` : '';
              return `<span class="${i === currentParamIndex ? 'current' : ''}">${p.name}: ${p.type}${value}</span>`;
            })
            .join(', ') || ''
        })
        ${paramDescriptions}
      `;

      // Position below current line
      const line = view.lineBlockAt(pos);
      const lineRect = view.coordsAtPos(line.from)!;

      helpPopup.style.display = 'block';
      helpPopup.style.top = `${lineRect.bottom + window.scrollY}px`;
      helpPopup.style.left = `${lineRect.left + window.scrollX}px`;
      helpPopup.classList.add('visible');

      // Update call highlighting
      view.dispatch({
        effects: callHighlightEffect.of({
          from: call.fullRange.start.offset,
          to: call.fullRange.end.offset,
        }),
      });
      return;
    }
  }

  helpPopup.style.display = 'none';
  helpPopup.classList.remove('visible');

  // Clear call highlighting
  view.dispatch({
    effects: callHighlightEffect.of(null),
  });
}

const errorDecorationField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);

    // Log current decorations before applying effects
    // Log current decorations in a more readable format
    for (const effect of tr.effects) {
      if (effect.is(errorDecorationFacet)) {
        // Log the decorations we're about to create
        const newDecorations = effect.value.flatMap((error) => [
          Decoration.widget({
            widget: new (class extends WidgetType {
              toDOM() {
                const span = document.createElement('span');
                span.className = 'error-message';
                span.textContent = '⚠️ ' + error.error.split('at line')[0].trim();
                // Always position at the end of the first line containing the error
                requestAnimationFrame(() => {
                  const firstErrorLine = window._editor?.state.doc.lineAt(error.from);
                  if (!firstErrorLine) return;

                  // Create measuring element for the first line only
                  const measureSpan = document.createElement('span');
                  measureSpan.style.visibility = 'hidden';
                  measureSpan.style.position = 'absolute';
                  measureSpan.style.whiteSpace = 'pre';
                  const anyLine = document.querySelector('.cm-line');
                  if (!anyLine) return;
                  measureSpan.style.font = window.getComputedStyle(anyLine).font;
                  measureSpan.textContent = firstErrorLine.text;
                  document.body.appendChild(measureSpan);

                  const textWidth = measureSpan.getBoundingClientRect().width;
                  document.body.removeChild(measureSpan);

                  const editor = document.querySelector('.cm-editor');
                  if (editor) {
                    const editorLeft = editor.getBoundingClientRect().left;
                    const leftPos = textWidth + 40 - editorLeft;
                    span.style.left = `${leftPos}px`;
                    // Position vertically at the first error line
                    const lineElement = editor.querySelector(
                      `[data-line="${firstErrorLine.number}"]`
                    );
                    if (lineElement) {
                      const lineRect = lineElement.getBoundingClientRect();
                      span.style.top = `${lineRect.top}px`;
                    }
                  }
                });

                return span;
              }
            })(),
            side: 1,
          }).range(error.from, error.from),
          Decoration.mark({
            attributes: {
              'data-error': 'true',
              title: error.error,
            },
            class: 'cm-error-mark',
          }).range(error.from, error.to),
        ]);

        decorations = Decoration.set(newDecorations);
      }
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// Set runtime base path for assets
getRuntimeBasePath(); // Initialize runtime base path

// Initialize split panes
Split(['#editor-pane', '#preview-pane'], {
  sizes: [50, 50],
  minSize: [300, 300],
  gutterSize: 8,
});

// Initialize camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

// Initialize app state
const appState = new AppState(camera);

// Initial tab update
updateTabs();

// Create tab bar elements
function createTabElement(doc: { id: string; name: string }, isActive: boolean): HTMLDivElement {
  const tab = document.createElement('div');
  tab.className = `tab${isActive ? ' active' : ''}`;
  tab.dataset.docId = doc.id;

  const title = document.createElement('div');
  title.className = 'tab-title';
  title.textContent = doc.name;
  title.addEventListener('click', (e) => {
    if (e.detail === 2) {
      // Double click
      title.contentEditable = 'true';
      title.focus();
    }
  });
  title.addEventListener('blur', () => {
    title.contentEditable = 'false';
    appState.renameDocument(doc.id, title.textContent || doc.name);
  });
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      title.blur();
    }
  });

  const close = document.createElement('div');
  close.className = 'tab-close';
  close.textContent = '×';
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    if (appState.getDocuments().length > 1) {
      appState.removeDocument(doc.id);
      updateTabs();
    }
  });

  tab.appendChild(title);
  tab.appendChild(close);
  tab.addEventListener('click', () => {
    appState.setActiveDocument(doc.id);
    updateTabs();
    editor.dispatch({
      changes: {
        from: 0,
        to: editor.state.doc.length,
        insert: appState.getActiveDocument().content,
      },
    });
    appState.setViewMode(ViewMode.Preview);
  });

  return tab;
}

function updateTabs() {
  const tabBar = document.querySelector('.tab-bar')!;
  const newTabButton = tabBar.querySelector('.new-tab-button')!;

  // Remove all tabs but keep the new tab button
  Array.from(tabBar.children).forEach((child) => {
    if (!child.classList.contains('new-tab-button')) {
      child.remove();
    }
  });

  // Add tabs for all documents
  const docs = appState.getDocuments();
  const activeDoc = appState.getActiveDocument();
  docs.forEach((doc) => {
    const tab = createTabElement(doc, doc.id === activeDoc.id);
    tabBar.insertBefore(tab, newTabButton);
  });
}

// Add new tab button handler
document.querySelector('.new-tab-button')?.addEventListener('click', () => {
  const id = appState.createNewDocument();
  appState.setActiveDocument(id);
  updateTabs();
  editor.dispatch({
    changes: {
      from: 0,
      to: editor.state.doc.length,
      insert: appState.getActiveDocument().content,
    },
  });
  appState.setViewMode(ViewMode.Preview);
});

// Initialize CodeMirror editor
const editor = new EditorView({
  state: EditorState.create({
    doc:
      `smooth_difference(0.03) {
  sphere(1);
  translate([0, 1, 0]) {
    sphere(0.7);
  }
  cylinder(0.3, 5);
}`,
    extensions: [
      basicSetup,
      javascript(),
      EditorView.updateListener.of(async (update: ViewUpdate) => {
        if (update.docChanged) {
          const content = update.state.doc.toString();
          appState.updateEditorContent(content);
        }
      }),
      oneDark,
      errorDecorationField,
      callHighlightField,
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged || update.selectionSet) {
          updateHelpPopup(update.view);
        }
      }),
      EditorView.theme({
        '&': {
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0 /* Important for nested flex! */,
          overflow: 'hidden',
        },
        '.cm-scroller': {
          overflow: 'auto',
          flex: 1,
          minHeight: 0 /* Important for nested flex! */,
        },
        '.cm-content': {
          minHeight: '100%',
        },
        '.cm-gutters': { backgroundColor: 'transparent' },
        '.cm-lineNumbers': { color: '#666' },
      }),
    ],
  }),
  parent: document.getElementById('editor-pane')!,
});

// Store editor instance for later use
window._editor = editor;

// Initial state update
appState.updateEditorContent(editor.state.doc.toString());

// Add keyboard handlers
document.addEventListener('keydown', (event) => {
  if (event.key === '5' && event.ctrlKey) {
    event.preventDefault();
    appState.setViewMode(ViewMode.Mesh);
    regenerateMesh(false); // Normal detail
  } else if (event.key === '6' && event.ctrlKey) {
    event.preventDefault();
    appState.setViewMode(ViewMode.Mesh);
    regenerateMesh(true); // High detail
  } else if (event.key === 'Escape') {
    appState.setViewMode(ViewMode.Preview);
    appState.cancelCurrentOperation();
  }
});

function regenerateMesh(highDetail: boolean = false) {
  appState.generateMesh(highDetail);
}

// Add button handlers
const saveStlButton = document.getElementById('save-stl') as HTMLButtonElement;
const generateMeshButton = document.getElementById('generate-mesh') as HTMLButtonElement;
const generateMeshHDButton = document.getElementById('generate-mesh-hd') as HTMLButtonElement;

saveStlButton.addEventListener('click', () => {
  const currentMesh = appState.getCurrentMesh();
  if (currentMesh) {
    downloadSTL(currentMesh, 'model.stl');
  } else {
    alert('Please generate a mesh first');
  }
});

generateMeshButton.addEventListener('click', () => {
  appState.setViewMode(ViewMode.Mesh);
  regenerateMesh(false);
});

generateMeshHDButton.addEventListener('click', () => {
  appState.setViewMode(ViewMode.Mesh);
  regenerateMesh(true);
});

import Split from 'split.js';
import { getRuntimeBasePath } from './utils/runtime-base';
import { downloadSTL } from './stlexporter';
import { StorageManager } from './storage/storage-manager';
import { GDriveProvider } from './storage/gdrive-provider';
import { showShareDialog } from './share-dialog';
import { indentWithTab } from '@codemirror/commands';
import {
  EditorView,
  keymap,
  ViewUpdate,
  Decoration,
  DecorationSet,
  WidgetType,
} from '@codemirror/view';
import { EditorState, StateEffect, StateField, Compartment } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { solarizedDark, solarizedLight } from '@uiw/codemirror-theme-solarized';
import { javascript } from '@codemirror/lang-javascript';
import { Parser } from './cad/parser';
import { ParseError } from './cad/errors';
import { getModuleDoc, getAllModuleNames } from './cad/docs';
import { basicSetup } from 'codemirror';
import * as THREE from 'three';
import { AppState, ViewMode } from './state';

// Import the default theme first to prevent flash of wrong theme
import './assets/themes/dark.css';
// Import other CSS themes to ensure they're bundled
import './assets/themes/common.css';
import './assets/themes/blue.css';
import './assets/themes/high-contrast.css';
import './assets/themes/solarized-light.css';

// Import the theme URLs for dynamic loading
import darkThemeUrl from './assets/themes/dark.css?url';
import blueThemeUrl from './assets/themes/blue.css?url';
import highContrastThemeUrl from './assets/themes/high-contrast.css?url';
import solarizedLightThemeUrl from './assets/themes/solarized-light.css?url';

// Function to reveal content when CSS is loaded
function revealContent() {
  document.documentElement.style.visibility = 'visible';
  document.body.style.visibility = 'visible';
  const loader = document.getElementById('css-loader');
  if (loader) {
    loader.style.display = 'none';
  }
}

// Wait for the DOM and initial CSS to be loaded
window.addEventListener('DOMContentLoaded', () => {
  // Small delay to ensure CSS is processed
  setTimeout(revealContent, 50);
});

// Add dynamic styles for mesh progress and completion
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
  
  .completion-list {
    max-height: 200px;
    overflow-y: auto;
    margin-top: 4px;
  }
  
  .completion-item {
    padding: 4px 8px;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .completion-item:hover {
    background-color: rgba(100, 100, 255, 0.2);
  }
  
  .completion-desc {
    color: #888;
    font-size: 0.9em;
    margin-left: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 300px;
  }
  
  .parameter-help {
    background-color: #1e1e1e;
    border: 1px solid #444;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    color: #eee;
    padding: 8px 12px;
    position: absolute;
    z-index: 1000;
    font-family: monospace;
    max-width: 400px;
  }
`;
document.head.appendChild(style);

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

// Function to handle completion selection
function handleCompletionSelection(view: EditorView, name: string, from: number, to: number) {
  // Insert the selected completion
  view.dispatch({
    changes: { from, to, insert: name },
  });

  // Hide the popup after selection
  helpPopup.style.display = 'none';
  helpPopup.classList.remove('visible');

  // Focus back on the editor
  view.focus();
}

// Function to update help popup
function updateHelpPopup(view: EditorView) {
  const pos = view.state.selection.main.head;
  if (!pos) {
    helpPopup.style.display = 'none';
    return;
  }

  // Get current line and character
  const line = view.state.doc.lineAt(pos);
  const lineText = line.text;
  const col = pos - line.from;

  // Check if we're potentially typing a function name
  // This regex finds an incomplete word that might be at the cursor
  const beforeCursor = lineText.substring(0, col);
  const wordMatch = beforeCursor.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)$/);

  if (wordMatch) {
    // We're typing what looks like a function name, show autocomplete
    const currentWord = wordMatch[1];
    const wordStart = pos - currentWord.length;

    // Get all module names for autocomplete
    const allModuleNames = getAllModuleNames();

    const moduleNames = allModuleNames.filter((name) =>
      name.toLowerCase().startsWith(currentWord.toLowerCase())
    );

    if (moduleNames.length > 0) {
      // Show autocomplete suggestions directly in the help popup
      let completionHtml = ``;
      moduleNames.forEach((name) => {
        const doc = getModuleDoc(name);
        const description = doc ? doc.description : '';

        completionHtml += `
          <div class="completion-item" data-name="${name}" data-from="${wordStart}" data-to="${pos}">
            <strong>${name}</strong>
            ${description ? `<span class="completion-desc">${description}</span>` : ''}
          </div>
        `;
      });

      helpPopup.innerHTML = completionHtml;
      helpPopup.style.display = 'block';

      // Position below current line
      const lineRect = view.coordsAtPos(line.from)!;
      helpPopup.style.top = `${lineRect.bottom + window.scrollY}px`;
      helpPopup.style.left = `${lineRect.left + window.scrollX}px`;
      helpPopup.classList.add('visible');

      // Add click handlers for completion items
      helpPopup.querySelectorAll('.completion-item').forEach((item) => {
        item.addEventListener('click', () => {
          const name = (item as HTMLElement).dataset.name!;
          const from = parseInt((item as HTMLElement).dataset.from!);
          const to = parseInt((item as HTMLElement).dataset.to!);
          handleCompletionSelection(view, name, from, to);
        });
      });

      return;
    }
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
      for (let i = 0; i < call.parameters.length; i++) {
        const param = call.parameters[i];
        if (pos >= param.range.start.offset && pos <= param.range.end.offset) {
          currentParamIndex = i;
          break;
        }
      }

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

// Initialize split panes with localStorage persistence
const savedSizes = localStorage.getItem('split-sizes');

Split(['#editor-pane', '#preview-pane'], {
  sizes: savedSizes ? JSON.parse(savedSizes) : [50, 50],
  minSize: [300, 300],
  gutterSize: 8,
  onDrag: function () {
    // Trigger resize for the renderer to update during dragging
    window.dispatchEvent(new Event('resize'));
  },
  onDragEnd: function (sizes) {
    // Save sizes to localStorage
    localStorage.setItem('split-sizes', JSON.stringify(sizes));

    // Trigger resize for the renderer to update
    window.dispatchEvent(new Event('resize'));
  },
});

// Initialize camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

// Add resize event listener to handle split view changes
window.addEventListener('resize', () => {
  appState.handleResize();
});

// Add rainbow mode setting
const RAINBOW_MODE_KEY = 'fncad-rainbow-mode';
let rainbowMode = localStorage.getItem(RAINBOW_MODE_KEY) !== 'false'; // Default to true

// Function to update rainbow mode
function updateRainbowMode(enabled: boolean) {
  rainbowMode = enabled;
  localStorage.setItem(RAINBOW_MODE_KEY, enabled.toString());
  // Update UI
  const menuItem = document.getElementById('view-rainbow-mode');
  if (menuItem) {
    menuItem.classList.toggle('active', enabled);
  }
  // Always refresh the shader when the rainbow mode changes
  appState.refreshPreview();
}

// Save state when window is closing
window.addEventListener('beforeunload', () => {
  appState.saveDocumentsToLocalStorage();
});

// Create theme compartment to isolate theme changes
const themeCompartment = new Compartment();

// Theme switching functionality
const THEME_STORAGE_KEY = 'fncad-theme';
let currentTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';

// Map application themes to editor themes
const editorThemes = {
  dark: oneDark,
  'solarized-light': solarizedLight,
  blue: solarizedDark,
  'high-contrast': oneDark, // Fallback to oneDark for high-contrast
};

// Function to load and apply a theme
function applyTheme(theme: string) {
  // Update active class in the menu
  document.querySelectorAll('.theme-option').forEach((el) => {
    el.classList.remove('active');
  });
  const activeThemeOption = document.getElementById(`theme-${theme}`);
  if (activeThemeOption) {
    activeThemeOption.classList.add('active');
  }

  // Dynamically load the theme CSS file if not already loaded
  let themeLink = document.getElementById('theme-style') as HTMLLinkElement;
  if (!themeLink) {
    themeLink = document.createElement('link');
    themeLink.id = 'theme-style';
    themeLink.rel = 'stylesheet';
    document.head.appendChild(themeLink);
  }

  // Use imported URLs for dynamic loading
  const themeUrls = {
    dark: darkThemeUrl,
    blue: blueThemeUrl,
    'high-contrast': highContrastThemeUrl,
    'solarized-light': solarizedLightThemeUrl,
  };

  themeLink.href = themeUrls[theme as keyof typeof themeUrls] || themeUrls['dark'];
  currentTheme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);

  // Update the editor theme if it exists
  if (window._editor) {
    const editorTheme = editorThemes[theme as keyof typeof editorThemes];
    if (editorTheme) {
      // Apply the new theme only to the theme compartment
      window._editor.dispatch({
        effects: themeCompartment.reconfigure(editorTheme),
      });
    }
  }
}

// Apply the saved theme or default to dark
applyTheme(currentTheme);

// Add event listeners for theme switching
document.getElementById('theme-dark')?.addEventListener('click', (e) => {
  e.preventDefault();
  applyTheme('dark');
});

document.getElementById('theme-solarized-light')?.addEventListener('click', (e) => {
  e.preventDefault();
  applyTheme('solarized-light');
});

document.getElementById('theme-blue')?.addEventListener('click', (e) => {
  e.preventDefault();
  applyTheme('blue');
});

document.getElementById('theme-high-contrast')?.addEventListener('click', (e) => {
  e.preventDefault();
  applyTheme('high-contrast');
});

// Add fullscreen toggle functionality
document.getElementById('toggle-fullscreen')?.addEventListener('click', (e) => {
  e.preventDefault();
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      console.error(`Error attempting to enable fullscreen: ${err.message}`);
    });
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
});

import { examples } from './examples';

// Initialize storage manager with authentication status update callback
const storageManager = new StorageManager(updateAuthStatusIcons);

// Initialize app state
const appState = new AppState(camera);

// Function to update authentication status icons
function updateAuthStatusIcons() {
  // Check GitHub authentication
  const githubToken = localStorage.getItem('fncad-gist-token');
  const githubIcon = document.getElementById('github-auth-status');
  if (githubIcon) {
    githubIcon.style.display = githubToken ? 'block' : 'none';
  }

  // Check Google Drive authentication
  const googleToken = localStorage.getItem('fncad-gdrive-token');
  const googleIcon = document.getElementById('google-auth-status');
  if (googleIcon) {
    googleIcon.style.display = googleToken ? 'block' : 'none';
  }
}

// Make this function globally available to be called from anywhere
declare global {
  interface Window {
    updateAuthStatusIcons: () => void;
    _editor?: EditorView;
    createEditorExtensions?: () => any[];
  }
}
window.updateAuthStatusIcons = updateAuthStatusIcons;

// Check for shared URL parameters on load
window.addEventListener('DOMContentLoaded', async () => {
  // Check if URL has parameters that might need loading
  const urlParams = new URLSearchParams(window.location.search);
  const hasGistParam = urlParams.has('gist');
  const hasGdriveParam = urlParams.has('gdrive');

  // Only show loading notification if we have relevant parameters
  let loadingNotification = null;
  if (hasGistParam || hasGdriveParam) {
    const provider = hasGistParam ? 'GitHub Gist' : 'Google Drive';
    loadingNotification = showNotification(`Loading from ${provider}...`, 'info');
  }

  try {
    const loadResult = await storageManager.checkUrlParameters(appState);
    if (loadResult.success) {
      updateTabs(); // Update tabs after loading from URL
      editor.dispatch({
        changes: {
          from: 0,
          to: editor.state.doc.length,
          insert: appState.getActiveDocument().content,
        },
      });

      // Update notification if it exists
      if (loadingNotification) {
        if (loadResult.existingDoc) {
          // If we just activated an existing document, don't show success notification
          if (loadingNotification.parentNode) {
            loadingNotification.parentNode.removeChild(loadingNotification);
          }
        } else {
          loadingNotification.textContent = 'Document loaded successfully!';
          loadingNotification.className = 'notification success';
          // Auto-hide success notification after 3 seconds
          setTimeout(() => {
            if (loadingNotification.parentNode) {
              loadingNotification.parentNode.removeChild(loadingNotification);
            }
          }, 3000);
        }
      }
    } else if (loadingNotification) {
      // If we had parameters but nothing loaded, remove the notification
      if (loadingNotification.parentNode) {
        loadingNotification.parentNode.removeChild(loadingNotification);
      }
    }
    updateAuthStatusIcons(); // Update auth icons on page load
  } catch (error) {
    console.error('Error loading from URL parameters:', error);
    // Update notification if it exists
    if (loadingNotification) {
      loadingNotification.textContent = `Error loading document: ${(error as Error).message}`;
      loadingNotification.className = 'notification error';
    }
  }
});

// Initial tab update
updateTabs();

// Initialize examples menu
const examplesDropdown = document.getElementById('examples-dropdown') as HTMLElement;
examples.forEach((example, index) => {
  const exampleLink = document.createElement('a');
  exampleLink.href = '#';
  exampleLink.textContent = example.name;
  exampleLink.dataset.index = index.toString();
  exampleLink.addEventListener('click', (e) => {
    e.preventDefault();
    loadExample(index);
    // Hide examples dropdown after selection
    examplesDropdown.style.display = 'none';
    setTimeout(() => {
      examplesDropdown.style.display = '';
    }, 300);
  });
  examplesDropdown.appendChild(exampleLink);
});

// Variables for hover delay
let examplesMenuTimeout: number | null = null;
const MENU_CLOSE_DELAY = 500; // 500ms delay before closing

// Make examples menu also respond to click (not just hover)
document.querySelector('.examples-menu-trigger')?.addEventListener('click', (e) => {
  e.preventDefault();
  const dropdown = document.getElementById('examples-dropdown');
  if (dropdown) {
    if (dropdown.style.display === 'block') {
      dropdown.style.display = 'none';
      dropdown.classList.remove('active');
    } else {
      // Position the dropdown correctly
      const trigger = e.currentTarget as HTMLElement;
      const rect = trigger.getBoundingClientRect();
      dropdown.style.top = `${rect.top}px`;
      dropdown.style.left = `${rect.right + 5}px`;
      dropdown.style.display = 'block';
      dropdown.classList.add('active');
    }
  }
});

// Position examples dropdown on mouseover
document.querySelector('.examples-menu-trigger')?.addEventListener('mouseover', (e) => {
  // Clear any existing timeout to close the menu
  if (examplesMenuTimeout) {
    window.clearTimeout(examplesMenuTimeout);
    examplesMenuTimeout = null;
  }

  const dropdown = document.getElementById('examples-dropdown');
  if (dropdown) {
    const trigger = e.currentTarget as HTMLElement;
    const rect = trigger.getBoundingClientRect();
    dropdown.style.top = `${rect.top}px`;
    dropdown.style.left = `${rect.right + 5}px`;
    dropdown.style.display = 'block';
    dropdown.classList.add('active');
  }
});

// Handle mouseout with delay
document.querySelector('.examples-menu-trigger')?.addEventListener('mouseout', () => {
  const dropdown = document.getElementById('examples-dropdown');
  if (dropdown && !dropdown.matches(':hover')) {
    // Set a timeout to close the menu
    examplesMenuTimeout = window.setTimeout(() => {
      if (!dropdown.matches(':hover')) {
        dropdown.style.display = 'none';
        dropdown.classList.remove('active');
      }
    }, MENU_CLOSE_DELAY);
  }
});

// Keep menu open when hovering over the dropdown itself
document.getElementById('examples-dropdown')?.addEventListener('mouseleave', () => {
  const dropdown = document.getElementById('examples-dropdown');
  if (dropdown) {
    // Set a timeout to close the menu
    examplesMenuTimeout = window.setTimeout(() => {
      dropdown.style.display = 'none';
      dropdown.classList.remove('active');
    }, MENU_CLOSE_DELAY);
  }
});

// Cancel close if we move back to the dropdown
document.getElementById('examples-dropdown')?.addEventListener('mouseenter', () => {
  if (examplesMenuTimeout) {
    window.clearTimeout(examplesMenuTimeout);
    examplesMenuTimeout = null;
  }
});

function loadExample(index: number) {
  const example = examples[index];
  if (example) {
    const id = appState.createNewDocument(); // This will create a document with default camera
    appState.setActiveDocument(id);
    appState.renameDocument(id, example.name);
    editor.dispatch({
      changes: {
        from: 0,
        to: editor.state.doc.length,
        insert: example.content,
      },
    });
    updateTabs();

    // Reset camera to default position for the example
    appState.resetCameraPosition();
  }
}

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
      e.stopPropagation();
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
    appState.setViewMode(ViewMode.Preview);

    // Update URL based on document storage
    updateUrlForDocument(appState.getActiveDocument());
  });

  return tab;
}

function updateTabs() {
  const tabContainer = document.querySelector('.tab-container')!;
  const newTabButton = tabContainer.querySelector('.new-tab-button')!;

  // Remove all tabs but keep the new tab button
  Array.from(tabContainer.children).forEach((child) => {
    if (!child.classList.contains('new-tab-button')) {
      child.remove();
    }
  });

  // Add tabs for all documents
  const docs = appState.getDocuments();
  const activeDoc = appState.getActiveDocument();
  docs.forEach((doc) => {
    const tab = createTabElement(doc, doc.id === activeDoc.id);
    tabContainer.insertBefore(tab, newTabButton);
  });
}

// Function to update URL based on document storage
function updateUrlForDocument(doc: ReturnType<typeof appState.getActiveDocument>) {
  if (doc.storage?.provider && doc.storage?.externalId) {
    // Create URL with provider and ID
    const url = new URL(window.location.href);
    url.searchParams.delete('gist');
    url.searchParams.delete('gdrive');
    url.searchParams.set(doc.storage.provider, doc.storage.externalId);
    history.replaceState({}, '', url.toString());
  } else {
    // Remove storage parameters from URL
    const url = new URL(window.location.href);
    url.searchParams.delete('gist');
    url.searchParams.delete('gdrive');
    history.replaceState({}, '', url.toString());
  }
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

  // Clear URL parameters for new document
  const url = new URL(window.location.href);
  url.searchParams.delete('gist');
  url.searchParams.delete('gdrive');
  history.replaceState({}, '', url.toString());
});

// Initialize CodeMirror editor
const editor = new EditorView({
  state: EditorState.create({
    doc: appState.getActiveDocument().content,
    extensions: createEditorExtensions(),
  }),
  parent: document.getElementById('editor-pane')!,
});

// Create a function to generate editor extensions
function createEditorExtensions() {
  return [
    basicSetup,
    keymap.of([indentWithTab]),
    javascript(),
    EditorView.updateListener.of(async (update: ViewUpdate) => {
      if (update.docChanged) {
        const content = update.state.doc.toString();
        appState.updateEditorContent(content);
      }
    }),
    themeCompartment.of(editorThemes[currentTheme as keyof typeof editorThemes] || oneDark),
    errorDecorationField,
    callHighlightField,
    EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged || update.selectionSet) {
        updateHelpPopup(update.view);
      }
    }),
    EditorView.domEventHandlers({
      keydown: (event, _view) => {
        // Handle escape key to hide the popup
        if (helpPopup.style.display === 'block' && event.key === 'Escape') {
          helpPopup.style.display = 'none';
          helpPopup.classList.remove('visible');
          return true;
        }

        return false;
      },
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
  ];
}

// Make extension creation function globally available
window.createEditorExtensions = createEditorExtensions;

// Store editor instance for later use
window._editor = editor;

// Add keyboard handlers
document.addEventListener('keydown', (event) => {
  if (event.key === '5' && event.ctrlKey) {
    event.preventDefault();
    appState.setViewMode(ViewMode.Mesh);
    appState.generateMesh();
  } else if (event.key === 'Escape') {
    appState.setViewMode(ViewMode.Preview);
    appState.cancelCurrentOperation();
  }
});

// Add menu handlers
document.getElementById('export-stl')?.addEventListener('click', (e) => {
  e.preventDefault();
  const currentMesh = appState.getCurrentMesh();
  if (currentMesh) {
    const activeDoc = appState.getActiveDocument();
    downloadSTL(currentMesh, `${activeDoc.name}.stl`);
  } else {
    alert('Please generate a mesh first');
  }
});

document.getElementById('new-document')?.addEventListener('click', (e) => {
  e.preventDefault();
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

document.getElementById('view-preview')?.addEventListener('click', (e) => {
  e.preventDefault();
  appState.setViewMode(ViewMode.Preview);
  appState.cancelCurrentOperation();
});

document.getElementById('view-mesh')?.addEventListener('click', (e) => {
  e.preventDefault();
  appState.setViewMode(ViewMode.Mesh);
  appState.generateMesh();
});

// Add rainbow mode toggle handler
document.getElementById('view-rainbow-mode')?.addEventListener('click', (e) => {
  e.preventDefault();
  updateRainbowMode(!rainbowMode);
});

// Initialize rainbow mode UI on load
document.addEventListener('DOMContentLoaded', () => {
  const rainbowModeMenuItem = document.getElementById('view-rainbow-mode');
  if (rainbowModeMenuItem) {
    rainbowModeMenuItem.classList.toggle('active', rainbowMode);
  }
});

// Function to show a notification
function showNotification(message: string, type: 'info' | 'success' | 'error' = 'info') {
  // Remove any existing notification
  const existingNotification = document.getElementById('status-notification');
  if (existingNotification) {
    document.body.removeChild(existingNotification);
  }

  // Create notification element
  const notification = document.createElement('div');
  notification.id = 'status-notification';
  notification.className = `notification ${type}`;
  notification.textContent = message;
  notification.style.position = 'fixed';
  notification.style.bottom = '20px';
  notification.style.right = '20px';
  notification.style.padding = '10px 15px';
  notification.style.borderRadius = '4px';
  notification.style.zIndex = '9999';
  notification.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';

  // Set color based on type
  if (type === 'info') {
    notification.style.backgroundColor = '#2196F3';
    notification.style.color = 'white';
  } else if (type === 'success') {
    notification.style.backgroundColor = '#4CAF50';
    notification.style.color = 'white';
  } else if (type === 'error') {
    notification.style.backgroundColor = '#F44336';
    notification.style.color = 'white';
  }

  document.body.appendChild(notification);

  // Auto-hide success and info notifications after 3 seconds
  if (type !== 'error') {
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }

  return notification;
}

// Add event listeners for share buttons
document.getElementById('share-gist')?.addEventListener('click', async (e) => {
  e.preventDefault();

  // Force close all dropdown menus
  document.querySelectorAll('.dropdown-content').forEach((dropdown) => {
    // Force display: none
    (dropdown as HTMLElement).style.display = 'none';

    // Reset the style after a brief delay to let CSS take over again
    setTimeout(() => {
      (dropdown as HTMLElement).style.removeProperty('display');
    }, 100);
  });

  // Show saving notification
  const notification = showNotification('Saving to Gist...', 'info');

  try {
    const result = await storageManager.saveDocument(appState, 'gist');
    if (result) {
      // Update notification
      notification.textContent = 'Saved successfully!';
      notification.className = 'notification success';

      // Show share dialog
      showShareDialog(result.url, result.filename);
    }
  } catch (error) {
    notification.textContent = `Error: ${(error as Error).message}`;
    notification.className = 'notification error';
  }
});

document.getElementById('share-gdrive')?.addEventListener('click', async (e) => {
  e.preventDefault();

  // Force close all dropdown menus
  document.querySelectorAll('.dropdown-content').forEach((dropdown) => {
    // Force display: none
    (dropdown as HTMLElement).style.display = 'none';

    // Reset the style after a brief delay to let CSS take over again
    setTimeout(() => {
      (dropdown as HTMLElement).style.removeProperty('display');
    }, 100);
  });

  // Show saving notification
  const notification = showNotification('Saving to Google Drive...', 'info');

  try {
    const result = await storageManager.saveDocument(appState, 'gdrive');
    if (result) {
      // Update notification
      notification.textContent = 'Saved successfully!';
      notification.className = 'notification success';

      // Show share dialog
      showShareDialog(result.url, result.filename);
    }
  } catch (error) {
    notification.textContent = `Error: ${(error as Error).message}`;
    notification.className = 'notification error';
  }
});

document.getElementById('import-url')?.addEventListener('click', (e) => {
  e.preventDefault();
  const url = prompt('Enter URL to import (must be a fnCAD share link):');
  if (url) {
    storageManager
      .loadFromUrl(appState, url)
      .then((success) => {
        if (!success) {
          alert('Invalid or unsupported URL. Please use a fnCAD share link.');
        }
      })
      .catch((error) => {
        alert(`Error importing from URL: ${(error as Error).message}`);
      });
  }
});

// GitHub logout
document.getElementById('github-logout')?.addEventListener('click', (e) => {
  e.preventDefault();

  // Close dropdown menu
  document.querySelectorAll('.dropdown-content').forEach((dropdown) => {
    // Force display: none
    (dropdown as HTMLElement).style.display = 'none';

    // Reset the style after a brief delay to let CSS take over again
    setTimeout(() => {
      (dropdown as HTMLElement).style.removeProperty('display');
    }, 100);
  });

  localStorage.removeItem('fncad-gist-token');
  updateAuthStatusIcons();
  showNotification('Logged out from GitHub', 'info');
});

// Google Drive logout
document.getElementById('google-logout')?.addEventListener('click', async (e) => {
  e.preventDefault();

  // Close dropdown menu
  document.querySelectorAll('.dropdown-content').forEach((dropdown) => {
    // Force display: none
    (dropdown as HTMLElement).style.display = 'none';

    // Reset the style after a brief delay to let CSS take over again
    setTimeout(() => {
      (dropdown as HTMLElement).style.removeProperty('display');
    }, 100);
  });

  // Get the GDrive provider and properly revoke access
  try {
    const gdriveProvider = storageManager.getProvider('gdrive') as GDriveProvider;
    if (gdriveProvider) {
      await gdriveProvider.revokeAccess();
    } else {
      localStorage.removeItem('fncad-gdrive-token');
    }
  } catch (error) {
    console.error('Error revoking Google Drive access:', error);
    localStorage.removeItem('fncad-gdrive-token');
  }

  updateAuthStatusIcons();
  showNotification('Logged out from Google Drive', 'info');
});

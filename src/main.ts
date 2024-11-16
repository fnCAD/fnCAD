import './style.css'
import Split from 'split.js'
import * as monaco from 'monaco-editor'

// Initialize split panes
Split(['#editor-pane', '#preview-pane'], {
  sizes: [50, 50],
  minSize: [300, 300],
  gutterSize: 8,
})

// Initialize Monaco editor
const editor = monaco.editor.create(document.getElementById('editor-pane')!, {
  value: `// Classic sphere SDF
sqrt(x*x + y*y + z*z) - 1`,
  language: 'typescript',
  theme: 'vs-dark',
  minimap: { enabled: false },
  automaticLayout: true,
})

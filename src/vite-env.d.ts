/// <reference types="vite/client" />

import * as monaco from 'monaco-editor';

declare global {
  interface Window {
    _editor: monaco.editor.IStandaloneCodeEditor;
  }
}

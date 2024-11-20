/// <reference types="vite/client" />

/// <reference types="vite/client" />

declare global {
  interface Window {
    _editor?: import('@codemirror/view').EditorView;
  }
}

export {};

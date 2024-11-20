/// <reference types="vite/client" />

declare global {
  interface Window {
    _editor?: import('@codemirror/view').EditorView;
  }
}

declare module '@codemirror/view' {
  interface EditorView {
    _editor?: EditorView;
  }
}

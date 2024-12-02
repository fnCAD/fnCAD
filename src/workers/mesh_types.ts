export interface SerializedMesh {
  vertices: number[];  // Flat array of vertex positions [x,y,z, x,y,z, ...]
  indices: number[];   // Triangle indices
  colors?: number[];   // Optional vertex colors [r,g,b, r,g,b, ...]
}

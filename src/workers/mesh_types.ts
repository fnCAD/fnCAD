export interface SerializedMesh {
  vertices: number[];  // Flat array of vertex positions [x,y,z, x,y,z, ...]
  indices: number[];   // Triangle indices
  normals?: number[];  // Optional flat array of normal vectors
}

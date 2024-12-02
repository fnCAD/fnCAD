export interface SerializedMesh {
  vertices: number[];    // Flat array of vertex positions [x,y,z, x,y,z, ...]
  indices: number[];     // Triangle indices
  faceColors?: number[]; // Optional face colors [r,g,b per face]
}

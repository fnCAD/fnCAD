import * as THREE from 'three';
import { SerializedMesh } from './types';

export interface STLExportOptions {
  scale?: number; // Scale factor for output (default: 1)
  name?: string; // Model name for STL header
}

export function exportToSTL(
  mesh: SerializedMesh | THREE.Mesh,
  options: STLExportOptions = {}
): ArrayBuffer {
  const scale = options.scale || 1;
  const name = options.name || 'Binary STL file exported from fnCAD';
  // Handle both SerializedMesh and THREE.Mesh
  let vertices: number[];
  let indices: number[];

  if (mesh instanceof THREE.Mesh) {
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    const index = geometry.index;

    if (!index) {
      throw new Error('Geometry must be indexed');
    }

    // Extract raw arrays
    vertices = Array.from(position.array);
    indices = Array.from(index.array);
  } else {
    vertices = mesh.vertices;
    indices = mesh.indices;
  }

  const triangleCount = indices.length / 3; // Each triangle uses 3 indices

  // Binary STL format:
  // 80 bytes - Header
  // 4 bytes - Number of triangles (uint32)
  // For each triangle:
  //   12 bytes - Normal vector (3 floats)
  //   36 bytes - Vertices (9 floats)
  //   2 bytes - Attribute byte count (uint16)
  // Binary STL format size calculation:
  // 80 bytes header + 4 bytes triangle count + (12+36+2) bytes per triangle
  const HEADER_SIZE = 80; // Header
  const COUNT_SIZE = 4; // Uint32 count
  const NORMAL_SIZE = 12; // 3 floats * 4 bytes
  const VERTEX_SIZE = 36; // 9 floats * 4 bytes
  const ATTR_SIZE = 2; // Uint16 attribute
  const TRIANGLE_SIZE = NORMAL_SIZE + VERTEX_SIZE + ATTR_SIZE;
  const bufferSize = Math.ceil(HEADER_SIZE + COUNT_SIZE + TRIANGLE_SIZE * triangleCount);

  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  // Write header (80 bytes)
  const encoder = new TextEncoder();
  const header = encoder.encode(name);
  for (let i = 0; i < 80; i++) {
    view.setUint8(i, i < header.length ? header[i] : 0);
  }

  // Write number of triangles
  view.setUint32(80, triangleCount, true);

  let offset = 84; // Start after header and triangle count

  for (let i = 0; i < indices.length; i += 3) {
    const idx1 = indices[i];
    const idx2 = indices[i + 1];
    const idx3 = indices[i + 2];

    const v1 = new THREE.Vector3(
      vertices[idx1 * 3],
      vertices[idx1 * 3 + 1],
      vertices[idx1 * 3 + 2]
    );
    const v2 = new THREE.Vector3(
      vertices[idx2 * 3],
      vertices[idx2 * 3 + 1],
      vertices[idx2 * 3 + 2]
    );
    const v3 = new THREE.Vector3(
      vertices[idx3 * 3],
      vertices[idx3 * 3 + 1],
      vertices[idx3 * 3 + 2]
    );

    // Calculate normal
    const normal = new THREE.Vector3()
      .crossVectors(new THREE.Vector3().subVectors(v2, v1), new THREE.Vector3().subVectors(v3, v1))
      .normalize();

    // Write normal
    view.setFloat32(offset, normal.x, true);
    offset += 4;
    view.setFloat32(offset, normal.y, true);
    offset += 4;
    view.setFloat32(offset, normal.z, true);
    offset += 4;

    // Write vertices with bounds checking, scaling to millimeters
    if (offset + VERTEX_SIZE <= bufferSize) {
      view.setFloat32(offset, v1.x * scale, true);
      offset += 4;
      view.setFloat32(offset, v1.y * scale, true);
      offset += 4;
      view.setFloat32(offset, v1.z * scale, true);
      offset += 4;

      view.setFloat32(offset, v2.x * scale, true);
      offset += 4;
      view.setFloat32(offset, v2.y * scale, true);
      offset += 4;
      view.setFloat32(offset, v2.z * scale, true);
      offset += 4;

      view.setFloat32(offset, v3.x * scale, true);
      offset += 4;
      view.setFloat32(offset, v3.y * scale, true);
      offset += 4;
      view.setFloat32(offset, v3.z * scale, true);
      offset += 4;
    } else {
      throw new Error(`Buffer overflow at offset ${offset} while writing vertices`);
    }

    // Write attribute byte count (unused)
    view.setUint16(offset, 0, true);
    offset += 2;
  }

  return buffer;
}

export function downloadSTL(
  mesh: SerializedMesh | THREE.Mesh,
  filename: string = 'model.stl'
): void {
  const buffer = exportToSTL(mesh, { scale: 100 }); // Convert to millimeters by default
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

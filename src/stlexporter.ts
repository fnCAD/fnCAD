import * as THREE from 'three';

export function exportToSTL(mesh: THREE.Mesh): ArrayBuffer {
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    const triangleCount = position.count / 3;
    
    console.log(`STL Export: Processing ${triangleCount} triangles`);
    console.log(`Position attribute count: ${position.count}`);
    console.log(`Vertices per triangle: ${position.count / triangleCount}`);
    
    // Binary STL format:
    // 80 bytes - Header
    // 4 bytes - Number of triangles (uint32)
    // For each triangle:
    //   12 bytes - Normal vector (3 floats)
    //   36 bytes - Vertices (9 floats)
    //   2 bytes - Attribute byte count (uint16)
    // Binary STL format size calculation:
    // 80 bytes header + 4 bytes triangle count + (12+36+2) bytes per triangle
    const HEADER_SIZE = 80;
    const COUNT_SIZE = 4;
    const NORMAL_SIZE = 12;   // 3 floats * 4 bytes
    const VERTEX_SIZE = 36;   // 9 floats * 4 bytes
    const ATTR_SIZE = 2;      // Uint16 attribute
    const TRIANGLE_SIZE = NORMAL_SIZE + VERTEX_SIZE + ATTR_SIZE;
    const bufferSize = HEADER_SIZE + COUNT_SIZE + (TRIANGLE_SIZE * triangleCount);
    
    console.log('Buffer allocation:', {
        headerSize: HEADER_SIZE,
        countSize: COUNT_SIZE,
        triangleSize: TRIANGLE_SIZE,
        triangleCount,
        totalSize: bufferSize,
        normalOffset: HEADER_SIZE + COUNT_SIZE,
        firstVertexOffset: HEADER_SIZE + COUNT_SIZE + NORMAL_SIZE
    });
    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);
    
    // Write header (80 bytes)
    const encoder = new TextEncoder();
    const header = encoder.encode('Binary STL file exported from fnCAD');
    for (let i = 0; i < 80; i++) {
        view.setUint8(i, i < header.length ? header[i] : 0);
    }
    
    // Write number of triangles
    view.setUint32(80, triangleCount, true);
    
    let offset = 84;  // Start after header and triangle count
    
    for (let i = 0; i < position.count; i += 3) {
        const v1 = new THREE.Vector3();
        const v2 = new THREE.Vector3();
        const v3 = new THREE.Vector3();
        
        v1.fromBufferAttribute(position, i);
        v2.fromBufferAttribute(position, i + 1);
        v3.fromBufferAttribute(position, i + 2);
        
        // Calculate normal
        const normal = new THREE.Vector3()
            .crossVectors(
                new THREE.Vector3().subVectors(v2, v1),
                new THREE.Vector3().subVectors(v3, v1)
            )
            .normalize();
        
        // Write normal
        view.setFloat32(offset, normal.x, true); offset += 4;
        view.setFloat32(offset, normal.y, true); offset += 4;
        view.setFloat32(offset, normal.z, true); offset += 4;
        
        // Write vertices with bounds checking
        if (offset + VERTEX_SIZE <= bufferSize) {
            console.log(`Writing triangle ${i/3} at offset ${offset}/${bufferSize}`);
            view.setFloat32(offset, v1.x, true); offset += 4;
            view.setFloat32(offset, v1.y, true); offset += 4;
            view.setFloat32(offset, v1.z, true); offset += 4;
            
            view.setFloat32(offset, v2.x, true); offset += 4;
            view.setFloat32(offset, v2.y, true); offset += 4;
            view.setFloat32(offset, v2.z, true); offset += 4;
            
            view.setFloat32(offset, v3.x, true); offset += 4;
            view.setFloat32(offset, v3.y, true); offset += 4;
            view.setFloat32(offset, v3.z, true); offset += 4;
        } else {
            throw new Error(`Buffer overflow at offset ${offset} while writing vertices`);
        }
        
        // Write attribute byte count (unused)
        view.setUint16(offset, 0, true); offset += 2;
    }
    
    return buffer;
}

export function downloadSTL(mesh: THREE.Mesh, filename: string = 'model.stl'): void {
    const buffer = exportToSTL(mesh);
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    
    URL.revokeObjectURL(url);
}

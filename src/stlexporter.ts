import * as THREE from 'three';

export function exportToSTL(mesh: THREE.Mesh): string {
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    
    let output = 'solid exported\n';
    
    for (let i = 0; i < position.count; i += 3) {
        // Get vertices of the triangle
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
        
        // Write facet
        output += ' facet normal ' + normal.x + ' ' + normal.y + ' ' + normal.z + '\n';
        output += '  outer loop\n';
        output += '   vertex ' + v1.x + ' ' + v1.y + ' ' + v1.z + '\n';
        output += '   vertex ' + v2.x + ' ' + v2.y + ' ' + v2.z + '\n';
        output += '   vertex ' + v3.x + ' ' + v3.y + ' ' + v3.z + '\n';
        output += '  endloop\n';
        output += ' endfacet\n';
    }
    
    output += 'endsolid exported\n';
    return output;
}

export function downloadSTL(mesh: THREE.Mesh, filename: string = 'model.stl'): void {
    const content = exportToSTL(mesh);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    
    URL.revokeObjectURL(url);
}

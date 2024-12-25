import * as THREE from 'three';
import { OctreeNode, CellState, octreeChildCenter } from './octree';

export class OctreeRenderSettings {
  constructor(
    public showOutside: boolean = true,
    public showInside: boolean = true,
    public showBoundary: boolean = true,
    public minRenderSize: number = 0.1
  ) {}
}

function getColorForCell(node: OctreeNode, size: number): THREE.Color {
  // Map size to a color - red for small cells, green for large
  // Using log scale since sizes vary greatly
  const maxSize = 65536; // Our current max size
  const t = Math.log(size) / Math.log(maxSize); // Normalized 0-1
  
  if (node.state === CellState.Boundary) {
    return new THREE.Color(1, 1, 0); // Bright yellow for leaf boundary cells
  } else if (node.state === CellState.BoundarySubdivided) {
    // Darker yellow for subdivided boundary cells, gets darker with depth
    const darkness = Math.max(0.2, t); // Limit darkness
    return new THREE.Color(darkness, darkness, 0);
  } else if (node.state === CellState.Inside) {
    return new THREE.Color(0, 1, 0); // Green for inside cells
  } else {
    return new THREE.Color(1, 0, 0); // Red for outside cells
  }
}

function createOctreeGeometry(node: OctreeNode, settings: OctreeRenderSettings, center: THREE.Vector3, size: number)
  : THREE.LineSegments | null
{
  // Skip if cell is too small to render
  if (size < settings.minRenderSize) {
    return null;
  }

  // Skip based on cell state and settings
  if ((node.state === CellState.Outside && !settings.showOutside) ||
      (node.state === CellState.Inside && !settings.showInside) ||
      ((node.state === CellState.Boundary || node.state === CellState.BoundarySubdivided) && !settings.showBoundary)) {
    return null;
  }

  // Create edges for this cell
  const half = size / 2;
  const corners = [
    [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
    [-1, -1, 1],  [1, -1, 1],  [-1, 1, 1],  [1, 1, 1]
  ];
  
  const vertices = corners.map(([x, y, z]) => 
    new THREE.Vector3(center.x + x * half, center.y + y * half, center.z + z * half)
  );

  // Create edges
  const geometry = new THREE.BufferGeometry();
  const edges = [
    [0,1], [1,3], [3,2], [2,0],  // Bottom face
    [4,5], [5,7], [7,6], [6,4],  // Top face
    [0,4], [1,5], [2,6], [3,7]   // Vertical edges
  ];
  
  const positions: number[] = [];
  edges.forEach(([a, b]) => {
    positions.push(
      vertices[a].x, vertices[a].y, vertices[a].z,
      vertices[b].x, vertices[b].y, vertices[b].z
    );
  });

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ 
    color: getColorForCell(node, size),
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: true,
    depthTest: true
  });

  return new THREE.LineSegments(geometry, material);
}

export function visualizeOctree(root: OctreeNode | null, settings: OctreeRenderSettings): THREE.Group | null {
  if (!root) return null;

  // Create a group to hold all octree geometries
  const group = new THREE.Group();
  group.userData.isOctreeVisualization = true;
  
  function addNodeToGroup(node: OctreeNode, center: THREE.Vector3, size: number) {
    const half = size / 2;
    const geom = createOctreeGeometry(node, settings, center, size);
    if (geom) {
      group.add(geom);
    }

    // Recurse into children
    node.children.forEach((child, index) => {
      if (child) {
        addNodeToGroup(child, octreeChildCenter(index, center, half), half);
      }
    });
  }
  
  addNodeToGroup(root, new THREE.Vector3(0, 0, 0), 65536);
  return group;
}

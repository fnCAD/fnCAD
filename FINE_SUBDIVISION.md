# Fine Subdivision Implementation Plan

## Problem
Current mesh generation has issues with non-axis-aligned sharp boundaries:
- Edges crossing octree quads at angles create poor triangulation
- Vertices are optimized at corners but not along edges
- Results in uneven mesh quality across faces

## Solution: Adaptive Face Subdivision

### Phase 1: Error Detection
1. During first optimization pass:
   - For each face, evaluate SDF at face centroid
   - Compare with linear interpolation from vertices
   - Calculate "badness metric":
     ```
     badness = abs(actual_sdf - interpolated_sdf) / max_edge_length
     ```
   - Track faces exceeding threshold in priority queue

### Phase 2: Edge-Based Subdivision with Vertex Sharing
1. While queue not empty and under subdivision limit:
   - Pop worst face
   - For each edge:
     - If edge already has pending split vertex, use it
     - Otherwise create new split vertex at midpoint
     - Record this vertex as pending for any adjacent faces
   - Update face indices:
     - Replace one face with four triangles using split vertices
     - Maintain consistent winding order
   - Handle neighbor faces:
     - If neighbor is in queue, it will use our split vertices later
     - If not in queue, mark it for single split using our vertex

2. After main subdivision loop:
   - Process all faces with pending split vertices:
     - Split each such face once using the pending vertex
     - Creates two triangles in the neighbor
     - Maintains mesh consistency without excessive subdivision

### Phase 3: Re-optimization
1. For each new vertex:
   - Initialize position at face centroid
   - Optimize using existing SDF gradient method
   - Update connected face normals

### Implementation Steps

1. Add face and edge tracking to MeshGenerator:
   - Add FaceQuality struct with metrics
   - Add EdgeMap to track shared edges
   - Modify optimization loop to evaluate edge midpoints
   - Create priority queue for bad faces

2. Implement subdivision logic:
   - Add methods to split individual faces
   - Handle vertex/index buffer updates
   - Manage neighbor relationships

3. Update optimization:
   - Extend vertex optimization to handle new points
   - Add subdivision count limits
   - Track mesh changes for visualization

4. Add configuration options:
   - Maximum subdivisions
   - Quality threshold
   - Edge length limits

5. Update visualization:
   - Show subdivision progress
   - Highlight problem areas
   - Display quality metrics

## Success Metrics
- Reduced maximum SDF error across faces
- More uniform triangle sizes along edges
- Better approximation of sharp features
- Controlled increase in triangle count

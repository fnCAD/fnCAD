# Edge-Based Mesh Refinement Plan

## Problem
Current mesh generation has issues with sharp features and curved surfaces:
- Initial triangulation follows octree faces, missing diagonal features
- Vertex optimization alone can't capture sharp edges well
- Need better adaptation to surface curvature

## Solution: Edge-Based Adaptive Refinement

### Core Insight
Instead of face-based subdivision, we use edges as the primary refinement primitive:
- Edges are the natural unit in half-edge mesh representation
- Edge midpoint SDF evaluation directly measures geometric error
- Splitting edges maintains mesh consistency naturally
- Avoids complex face subdivision patterns

### Phase 1: Edge Quality Analysis
1. For each edge in the mesh:
   - Compute midpoint position
   - Evaluate SDF at midpoint
   - Calculate edge error metric:
     ```
     error = sdf / edge_length
     ```
   - Track edges exceeding threshold in priority queue

### Phase 2: Edge-Based Refinement
1. While queue not empty and under subdivision limit:
   - Pop worst edge
   - Create new vertex at midpoint
   - Split both adjacent faces:
     - Each triangle becomes two triangles
     - New triangles share the split edge vertex
     - Maintains half-edge connectivity
   - Optimize new vertex position using SDF gradient
   - Evaluate new edges for potential splitting

### Implementation Steps

1. Add edge quality tracking:
   - Add EdgeQuality struct with error metrics
   - Implement edge midpoint evaluation
   - Create priority queue for bad edges

2. Implement edge splitting:
   - Add methods to split individual edges
   - Update half-edge connectivity
   - Maintain consistent winding order
   - Handle vertex buffer updates

3. Update optimization:
   - Extend vertex optimization for new points
   - Add subdivision count/depth limits
   - Track mesh changes for visualization

4. Add configuration options:
   - Maximum subdivisions per edge
   - Error threshold
   - Minimum edge length

5. Update visualization:
   - Show edge quality heat map
   - Highlight edges marked for splitting
   - Display refinement progress

### Benefits
- Natural fit with half-edge data structure
- Simpler implementation than face subdivision
- Better handling of sharp features
- More uniform refinement based on actual geometry
- Maintains mesh consistency automatically

## Success Metrics
- Reduced maximum SDF error along edges
- Better approximation of sharp features
- Controlled and localized refinement
- Manifold mesh preservation

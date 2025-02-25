# Vertex Optimization Improvement Proposal

## Current Implementation

The current vertex optimization in `src/halfedge.ts` has a few inefficiencies:

1. It calculates the gradient using 4 separate SDF evaluations (center + 3 offset points)
2. It doesn't leverage the node's `evaluateContent` method which already has SDF information
3. The optimization loop could be more efficient

## Proposed Changes

### 1. Add Gradient Calculation to Node Interface

Extend the `Node` class in `src/sdf_expressions/types.ts` to include a gradient calculation method:

```typescript
abstract class Node {
  // Existing methods...
  
  /**
   * Calculates the SDF value and its gradient at a point
   * @param point The point to evaluate
   * @returns Object containing the SDF value and gradient vector
   */
  evaluateWithGradient(point: THREE.Vector3): { 
    value: number; 
    gradient: THREE.Vector3;
  } {
    // Default implementation using finite differences
    const h = 0.0001; // Small offset for gradient calculation
    const value = this.evaluate(point.x, point.y, point.z);
    
    const gradX = (this.evaluate(point.x + h, point.y, point.z) - 
                   this.evaluate(point.x - h, point.y, point.z)) / (2 * h);
    const gradY = (this.evaluate(point.x, point.y + h, point.z) - 
                   this.evaluate(point.x, point.y - h, point.z)) / (2 * h);
    const gradZ = (this.evaluate(point.x, point.y, point.z + h) - 
                   this.evaluate(point.x, point.y, point.z - h)) / (2 * h);
    
    return {
      value,
      gradient: new THREE.Vector3(gradX, gradY, gradZ)
    };
  }
}
```

### 2. Optimize the Vertex Optimization Method

```typescript
private optimizeVertex(vertex: Vertex, sdf: Node): number {
  const maxIterations = 10;
  const epsilon = 0.0001;
  let maxMove = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    // Use the node from vertex content if available, otherwise use the provided SDF
    const node = vertex.content?.node || sdf;
    
    // Get value and gradient in one call
    const { value: distance, gradient } = node.evaluateWithGradient(vertex.position);
    
    // Normalize gradient
    gradient.normalize();
    
    // Move vertex along gradient to surface
    const move = -distance;
    vertex.position.addScaledVector(gradient, move);
    
    maxMove = Math.max(maxMove, Math.abs(move));
    
    // Stop if vertex barely moved
    if (Math.abs(move) < epsilon) {
      break;
    }
  }

  return maxMove;
}
```

## Benefits

1. **Efficiency**: Reduces SDF evaluations from 4 to 1 per iteration
2. **Consistency**: Uses the same SDF evaluation logic throughout the codebase
3. **Extensibility**: Specific Node implementations can provide more efficient gradient calculations
4. **Clarity**: Makes the relationship between SDF and gradient explicit

## Implementation Strategy

1. Add the `evaluateWithGradient` method to the `Node` class
2. Update the `optimizeVertex` method in `HalfEdgeMesh`
3. Consider adding specialized gradient calculations for common primitives (sphere, box, etc.)

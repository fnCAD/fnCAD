# Content Type Refactoring Proposal

## Current Issues

The current `Content` type in `src/sdf_expressions/types.ts` has several issues:

1. It can be `null`, which requires null checks throughout the codebase
2. It mixes several responsibilities:
   - Categorizing regions (inside/outside/face/complex)
   - Storing SDF value estimates
   - Tracking minimum feature size
   - Referencing the node that created it
3. The `minSize` property is optional but required for certain categories

## Proposed Solution

Replace the current `Content` type with a discriminated union of specific types:

```typescript
// Base interface with common properties
interface ContentBase {
  sdfEstimate: Interval;
}

// For regions completely inside an object
interface InsideContent extends ContentBase {
  category: 'inside';
}

// For regions completely outside all objects
interface OutsideContent extends ContentBase {
  category: 'outside';
}

// For regions containing a single surface
interface FaceContent extends ContentBase {
  category: 'face';
  node: Node;
  minSize: number;
}

// For regions with multiple or ambiguous surfaces
interface ComplexContent extends ContentBase {
  category: 'complex';
  node: Node;
  minSize: number;
}

// The main discriminated union type
type Content = InsideContent | OutsideContent | FaceContent | ComplexContent;
```

## Implementation Strategy

1. Create the new type definitions
2. Update the `evaluateContent` method in all Node subclasses
3. Remove null checks and replace with proper type handling
4. Update the octree subdivision logic to use the new types

## Benefits

1. No more null checks - every Content value is valid
2. Type safety - TypeScript will enforce required properties for each category
3. Better IDE support with autocomplete for category-specific properties
4. Clearer code intent - the type itself documents the requirements

## Example Usage

```typescript
function processContent(content: Content): number {
  switch (content.category) {
    case 'inside':
      return -1;
    case 'outside':
      return 1;
    case 'face':
    case 'complex':
      // TypeScript knows minSize exists here
      return content.minSize;
  }
}
```

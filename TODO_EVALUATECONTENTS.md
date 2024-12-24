# SDF Evaluation Methods Refactor

## Current Methods

The SDF system currently has three ways to evaluate distances:

1. `evaluate(Point3): float`
   - Direct distance query
   - Used for numerical derivative for mesh optimization

2. `evaluateInterval(x: Interval, y: Interval, z: Interval): Interval`
   - Used for octree subdivision
   - Returns meaningful SDF value bounds

3. `toGLSL()`
   - Generates shader code for raymarching

## Planned Addition: evaluateContent()

Adding a fourth evaluation method:

```typescript
evaluateContent(x: Interval, y: Interval, z: Interval): null | {
  category: 'face' | 'edge' | 'outside' | 'inside'
}
```

This will replace `evaluateInterval` for octree subdivision.

`evaluateContent` is `null` on most arithmetic.

The new SDF function `face(...)` returns `'face'` iff its child `evaluateInterval` contains 0.

A 'face' in this parlance is (part of) the boundary of an object that is usually smooth (bounded first derivative).

Cases:
- `null`: "plain arithmetic".
- `'face'`: contains a known face (set with `face(...)`)
- `'edge'`: contains *more than one* known face.
   - We want to recurse on this.
- `'outside'`: does not contain any faces.
- `'inside'`: fully inside one or more objects.

The idea here is that a SDF expression will *generally* have a form of
"CSG things (min/max), `face()`, arithmetic things".
So `min`/`max` recurse to their children, but `+` does not and just returns `null`.

### Key Benefits

1. **Edge-Aware Subdivision**
   - Can track which primitive(s) are contained in a volume
   - Enables targeted subdivision where primitives meet
   - Define built-in elements so that each "face" is a primitive
   - Places where primitives meet are usually edges.

2. **Primitive-Specific Information**
   - Cubes: Each face is a primitive
   - Spheres: Single primitive
   - Option for CSG-aware object coloring by adding material to the contents result later

3. **AABB Optimization**
   - Unlike evaluateInterval, can take advantage of AABB
      - We can return 'outside' without computing exact bounds
   - Octree subdivision doesn't need distance.

### Implementation Strategy

1. Initial subdivision uses evaluateContents()
2. Transitions to evaluateInterval() in `face()` nodes.

This refactor will improve quality on transitions between objects for cheap.

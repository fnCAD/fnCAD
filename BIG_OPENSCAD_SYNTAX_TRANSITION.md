# OpenSCAD Syntax Transition Plan

## Rationale

The transition to OpenSCAD-like syntax serves multiple purposes:

1. **Familiarity**: OpenSCAD is the de-facto standard for programmatic CAD. Using its syntax makes our tool immediately accessible to existing users.

2. **Separation of Concerns**: The current SDF expression parser conflates two roles:
   - Low-level SDF primitive definitions
   - High-level CAD operations
   Moving to OpenSCAD syntax lets us properly separate these concerns.

3. **Type Safety**: OpenSCAD's module system provides natural boundaries for type checking and validation, making the codebase more maintainable.

4. **Future Extensibility**: A proper module system makes it easier to add new features and optimize existing ones without touching core SDF logic.

## 1. Namespace Reorganization

### Current SDF Expression Parser
Move to `src/sdf_expressions/` to reflect its role as an implementation detail:
- `parser.ts` -> `sdf_expressions/parser.ts`
- `evaluator.ts` -> `sdf_expressions/evaluator.ts`
- `ast.ts` -> `sdf_expressions/ast.ts`

Rationale: This preserves the existing SDF implementation while clearly marking it as internal infrastructure.

### New OpenSCAD Parser
Create `src/openscad/` for the new public API:
- `parser.ts` - OpenSCAD syntax parser
- `ast.ts` - AST with proper CAD semantics
- `evaluator.ts` - Evaluates to SDF expressions
- `types.ts` - Type system for modules
- `builtins.ts` - Standard library

## 2. Implementation Strategy

### Phase 1: Infrastructure
Establish clean separation between layers:
- SDF layer: Pure mathematical primitives
- OpenSCAD layer: CAD operations and modules
- Bridge layer: Converts between representations

### Phase 2: Basic OpenSCAD Syntax
Focus on core operations first:
- Primitive shapes (cube, sphere, etc)
- Boolean operations (union, difference)
- Basic transformations
- Simple modules

### Phase 3: Type System
Add safety and maintainability:
- Module interface definitions
- Parameter validation
- Proper error messages
- Design-time checks

### Phase 4: SDF Integration
Make the layers work together:
- Efficient lowering to SDFs
- Preserve SDF properties
- Optimize common patterns
- Handle edge cases

### Phase 5: Advanced Features
Polish for production use:
- Import/export
- Standard library
- Error recovery
- IDE support

## 3. Migration Strategy

1. Keep existing SDF parser for internal use
2. Build OpenSCAD layer on top
3. Convert examples gradually
4. Maintain compatibility where needed

## 4. Testing Strategy

1. Unit tests per layer:
   - SDF primitives
   - OpenSCAD operations
   - Integration between layers
2. Real-world examples
3. Performance benchmarks

## 5. Documentation

1. User-facing:
   - OpenSCAD syntax guide
   - Migration guide
   - Examples
2. Internal:
   - Architecture docs
   - API references

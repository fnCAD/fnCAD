# OpenSCAD Syntax Transition Plan

## 1. Namespace Reorganization

### Current SDF Expression Parser
Move existing parser and evaluator code to a dedicated namespace:
- Create `src/sdf/` directory for SDF-specific code
- Move and rename files:
  - `parser.ts` -> `sdf/expression-parser.ts`
  - `evaluator.ts` -> `sdf/expression-evaluator.ts`
  - `ast.ts` -> `sdf/expression-ast.ts`
  - Move related tests to `sdf/` directory

### New OpenSCAD Parser
Create new namespace for OpenSCAD-style syntax:
- Create `src/openscad/` directory
- New files:
  - `openscad/parser.ts` - Main parser
  - `openscad/ast.ts` - AST definitions
  - `openscad/evaluator.ts` - Evaluator
  - `openscad/types.ts` - Type system
  - `openscad/builtins.ts` - Built-in modules/functions

## 2. Implementation Phases

### Phase 1: Infrastructure
- [x] Create directory structure
- [ ] Move existing SDF code
- [ ] Update imports
- [ ] Verify tests still pass
- [ ] Create skeleton for OpenSCAD parser

### Phase 2: Basic OpenSCAD Syntax
- [ ] Parser for basic expressions
- [ ] Module definitions
- [ ] Basic transformations
- [ ] Variable bindings
- [ ] Basic control flow

### Phase 3: Type System
- [ ] Define core types
- [ ] Type checking
- [ ] Module interfaces
- [ ] Error reporting

### Phase 4: SDF Integration
- [ ] Bridge between OpenSCAD AST and SDF expressions
- [ ] Transformation handling
- [ ] Module lowering to SDFs
- [ ] Optimization passes

### Phase 5: Advanced Features
- [ ] Import/export
- [ ] Standard library
- [ ] Error recovery
- [ ] Source maps
- [ ] IDE integration

## 3. Migration Strategy

1. Keep existing SDF expression parser as implementation detail
2. Create new OpenSCAD parser as main entry point
3. Implement OpenSCAD primitives in terms of SDFs
4. Gradually transition examples and tests
5. Add compatibility layer if needed

## 4. Testing Strategy

1. Move existing tests to `sdf/` namespace
2. Create new test suite for OpenSCAD parser
3. Add integration tests between systems
4. Test real OpenSCAD examples
5. Performance benchmarks

## 5. Documentation Updates

1. Update README with new syntax
2. Document migration path
3. Create OpenSCAD compatibility guide
4. Update examples
5. API documentation

## 6. Timeline

1. Namespace reorganization: 1-2 days
2. Basic syntax implementation: 1 week
3. Type system: 1-2 weeks
4. SDF integration: 1 week
5. Advanced features: 2+ weeks

Total estimated time: 4-6 weeks

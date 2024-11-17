# Code Style Guidelines

1. Prefer early returns over nested if blocks
   ```typescript
   // Prefer this:
   if (!condition) return
   doWork()
   
   // Over this:
   if (condition) {
     doWork()
   }
   ```

2. Use guard clauses
   - Check preconditions at the start of functions
   - Return early if preconditions aren't met

3. Keep functions focused
   - Each function should do one thing well
   - Extract complex logic into helper functions

4. Explicit over implicit
   - Pass dependencies as parameters rather than using global state
   - Make data flow visible through function parameters

5. Immutable by default
   - Prefer const over let
   - Create new objects instead of mutating existing ones

6. Strong typing
   - Avoid any type
   - Use interfaces and type aliases to describe data structures
   - Make impossible states impossible through types

7. Error handling
   - Use explicit error types
   - Handle errors at the appropriate level
   - Don't swallow errors silently

8. Testing
   - Write tests for new functionality
   - Test edge cases
   - Keep tests focused and descriptive

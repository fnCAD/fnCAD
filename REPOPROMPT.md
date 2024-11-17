# Code Style Guidelines

1. Prefer early returns over nested if blocks
   ```typescript
   // Prefer this:
   if (!condition) return;
   doWork();
   
   // Over this:
   if (condition) {
     doWork();
   }
   ```

2. Use guard clauses
   - Check preconditions at the start of functions
   - Return early if preconditions aren't met
   - Don't propagate, exclude: `assert` over `return null`.

3. Keep functions focused
   - Each function should do one thing well
   - Extract complex logic into helper functions

4. Explicit over implicit
   - Pass dependencies as parameters rather than using global state
   - Make data flow visible through function parameters

5. Immutable by default
   - Prefer const over let
   - Create new objects instead of mutating existing ones
   - Within reason: we're in JS, there is a GC to consider.

6. Strong typing
   - Avoid any type
   - Use interfaces and type aliases to describe data structures
   - Make impossible states impossible through types

7. Error handling
   - Don't swallow errors silently
   - Limit try/catch to specific scopes with known errors
   - Prefer `assert` over `return null` if you're not sure
     if a condition may hold - let the runtime tell you.
   - Don't be afraid of throwing all the way.

8. Testing
   - Write tests for new functionality
   - Don't overtest: test functionality, not errata.
   - Keep tests descriptive and well-commented: tell a story with every test.
      - "Why" is more valuable than "what." "What" changes often, "why" changes rarely.

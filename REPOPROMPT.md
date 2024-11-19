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

2. Avoid the Visitor pattern
   - It's a historic artifact of C++ not having algebraic data types.
   - Prefer to keep type-specific functionality grouped by noun (class) rather than verb (method).

3. Use guard clauses
   - Check preconditions at the start of functions
   - Return early if preconditions aren't met
   - Don't propagate, exclude: `assert` over `return null`.

4. Explicit over implicit
   - Pass dependencies as parameters rather than using global state
   - Make data flow visible through function parameters

5. Error handling
   - Don't swallow errors silently
   - Limit try/catch to specific scopes with known errors
   - Prefer `assert` over `return null` if you're not sure
     if a condition may hold - let the runtime tell you.
   - Don't be afraid of throwing all the way.

6. Testing
   - Test behavior (end-to-end), not content (returned object properties).
   - It's always a good idea to suggest `npm run typecheck` or `npm test` after a change.
   - Keep tests descriptive and well-commented: tell a story with every test.
   - "Why" is more valuable than "what." "What" changes often, "why" changes rarely.

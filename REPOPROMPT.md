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

3. Explicit over implicit
   - Pass dependencies as parameters rather than using global state
   - Make data flow visible through function parameters

4. Error handling
   - Don't swallow errors silently
   - Limit try/catch to specific scopes with known errors
   - Prefer `assert` over `return null` if you're not sure
     if a condition may hold - let the runtime tell you.
   - Don't be afraid of throwing all the way.

5. Testing
   - Don't overtest: test functionality, not errata.
   - It's always a good idea to suggest `npm run typecheck` or `npm test` after a change.
   - Keep tests descriptive and well-commented: tell a story with every test.
   - "Why" is more valuable than "what." "What" changes often, "why" changes rarely.

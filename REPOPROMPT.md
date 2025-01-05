# Repo use guidelines

The details of current tasks and ongoing projects are summarized in md files in the toplevel, such as this one.
When you finish a task from a TODO, remember to check it off in the file in the same response.
If it turns out to need more work, add subtasks in the same response.

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
   - Only use try/catch in specific scopes with known errors
   - Prefer `assert` over `return null` if you're not sure
     if a condition may hold - let the runtime tell you.
   - Don't overcatch - it's not a problem to throw all the way to the browser/console.
     Backtraces are **more** valuable than functioning code.

6. Testing
   - Test behavior (end-to-end), not content (returned object properties).
   - It's always a good idea to suggest `npm run typecheck` or `npm test` after a change.
   - Keep tests descriptive and well-commented: tell a story with every test.
   - "Why" is more valuable than "what." "What" changes often, "why" changes rarely.

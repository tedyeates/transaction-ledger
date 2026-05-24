# Implementation Constraints
- **Only 1 task.** Complete only one top-level task, ONE top-level task means: a single root-level item (e.g., `1.`, `2.`, `3.`) and all of its subtasks (e.g., `2.1`, `2.2`, `2.3`).
- **Frontend first.** Build complete UI against mock data before any backend code. User must approve frontend before backend begins.
- **Local only.** Never depend on cloud services during development. 
- **Keep mock/real interface identical** so the swap is seamless.
- **Real tests** tests should only mock third party apis. Frontend tests should focus on front end displays with mock data. Backend tests should test the api and database functions, tests should use local database and not mock database calls.
# Implementation Constraints
- **Only 1 task.** Complete only one top-level task, ONE top-level task means: a single root-level item (e.g., `1.`, `2.`, `3.`) and all of its subtasks (e.g., `2.1`, `2.2`, `2.3`).
- **Frontend first.** Build complete UI against mock data before any backend code. User must approve frontend before backend begins.
- **Local only.** Never depend on cloud services during development. 
- **Keep mock/real interface identical** so the swap is seamless.
- **Mock only Third Party** The only acceptable mock target is the external API. Everything else (DB, validation, routing, CORS) runs real locally.
- **Testing is not optional**
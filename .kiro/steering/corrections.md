# Universal Corrections

## Behavior

Every response where you make a mistake, hit an error, use a wrong command, make a false assumption, or have to retry/adjust — you MUST immediately append a correction entry to the corrections log referenced below.

**Read the corrections log BEFORE starting any work.** Never repeat a listed mistake.

## When to Write a Correction

- Wrong CLI command or binary name
- Missing flags, env vars, or config needed for a command to work
- Import path or module resolution issues
- API or library usage that differs from what you assumed
- File paths or naming conventions you got wrong
- Build/test/lint commands that need specific arguments
- Platform-specific gotchas (OS, runtime version, etc.)
- Any assumption that turned out to be false
- Any error that required a retry or workaround

## Format

Each entry in the corrections log follows this format:

```
- ❌ [what you did wrong] → ✅ [what the fix was] (brief reason)
```

For unresolved issues:
```
- ❌ UNRESOLVED: [description of issue that couldn't be fixed]
```

## Subagent Delegation

When delegating tasks to subagents (invoke_sub_agent), you MUST include both this steering file AND the corrections log as context files:

- `.kiro/steering/corrections.md` (this file — so subagents know the rules)
- `.kiro/corrections.md` (the log — so subagents can read existing corrections and append new ones)

Subagents MUST follow the same correction rules: read the log before starting, append entries when errors occur.

## Corrections Log

#[[file:.kiro/corrections.md]]

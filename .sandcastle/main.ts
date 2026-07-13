/**
 * Sandcastle Runner — per-project main.ts template.
 *
 * Copy to `.sandcastle/main.ts` in your project repo and customise the config.
 * Run: npx tsx .sandcastle/main.ts --prd <number> [--dry-run]
 */

import { createSandbox } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

// ─── Project Config (edit per-repo) ──────────────────────────────────────────

const config = {
  repo: "tedyeates/transaction-ledger",
  setup: "pnpm install",
  test: "pnpm test",
  typeCheck: "echo 'no type check'",
  // Host commands — run on host machine (not in sandbox).
  // Useful for supabase CLI, DB migrations, pgTap tests, etc.
  hostSetup: "npx supabase start",
  hostTest: "npx supabase test db",
  timeoutSeconds: 900,
  agentLabel: "ready-for-agent", // only tasks carrying this label are implemented
};

// ─── CLI Arg Parsing ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const prdIdx = args.indexOf("--prd");
const prdNumber = prdIdx !== -1 ? Number(args[prdIdx + 1]) : NaN;
const dryRun = args.includes("--dry-run");
// --verbose / -v: stream agent + check output live to the terminal (for testing).
// Logs are still written to .sandcastle/logs/ regardless.
const verbose = args.includes("--verbose") || args.includes("-v");

if (isNaN(prdNumber)) {
  console.error("Usage: npx tsx .sandcastle/main.ts --prd <number> [--dry-run] [--verbose|-v]");
  process.exit(1);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function gh(cmd: string): string {
  return execSync(`gh ${cmd}`, { encoding: "utf-8" }).trim();
}

function log(msg: string) {
  const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
  console.log(`[${ts}] ${msg}`);
}

function elapsed(start: number): string {
  const s = Math.round((Date.now() - start) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`;
}

// Returns an onLine callback that mirrors sandbox output to the terminal when
// --verbose is set; otherwise undefined (output is only captured to the log).
function liveStream(prefix: string): ((line: string) => void) | undefined {
  if (!verbose) return undefined;
  return (line: string) => process.stdout.write(`  │ ${prefix} ${line}\n`);
}

// Runs a command on the host machine (not in the sandbox). Used for things like
// supabase CLI that need direct access to Docker/host networking.
function runOnHost(cmd: string, label: string): { exitCode: number; output: string } {
  log(`[host] ${label}: ${cmd}`);
  try {
    const output = execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    if (verbose) process.stdout.write(`  │ host:${label} ${output}\n`);
    return { exitCode: 0, output };
  } catch (err: any) {
    const output = (err.stdout || "") + "\n" + (err.stderr || "");
    if (verbose) process.stderr.write(`  │ host:${label} FAILED\n${output}\n`);
    return { exitCode: err.status ?? 1, output };
  }
}

// ─── Auth ────────────────────────────────────────────────────────────────────

// Ensures a valid Kiro SSO token exists on the host before launching the sandbox.
// The token is managed by kiro-cli and cached at ~/.aws/sso/cache/kiro-auth-token.json,
// which is mounted (writable) into the container so the agent inherits the session.
// If missing/expired, launches the device flow (prints a URL to open in the host
// browser). For fully unattended runs, prefer headless API-key auth (KIRO_API_KEY).
function ensureAuth() {
  const tokenPath = resolve(homedir(), ".aws", "sso", "cache", "kiro-auth-token.json");
  try {
    const token = JSON.parse(readFileSync(tokenPath, "utf-8"));
    const expiresAt = new Date(token.expiresAt).getTime();
    const bufferMs = 5 * 60 * 1000; // 5min buffer
    if (Date.now() < expiresAt - bufferMs) {
      log("Auth token valid.");
      return;
    }
    log("Auth token expired or expiring soon. Re-authenticating...");
  } catch {
    log("No auth token found. Logging in...");
  }
  execSync("kiro-cli login --use-device-flow", { stdio: "inherit" });
  log("Auth refreshed.");
}

// ─── Task Sourcing (#40) ─────────────────────────────────────────────────────

interface SubIssue {
  number: number;
  title: string;
  body: string;
  state: string;
  blockedBy: number[];
}

function fetchDesignPath(): string | undefined {
  const body = gh(`api repos/${config.repo}/issues/${prdNumber} --jq ".body"`);
  const match = body.match(/^Design:\s*(.+)$/m);
  return match?.[1]?.trim();
}

function fetchAllSubIssues(): SubIssue[] {
  const raw = gh(`api repos/${config.repo}/issues/${prdNumber}/sub_issues`);
  if (!raw) return [];

  const issues: Array<{
    number: number;
    title: string;
    body: string;
    state: string;
    labels?: Array<{ name: string }>;
    issue_dependencies_summary?: { blocked_by: number };
  }> = JSON.parse(raw);

  return issues
    .filter((i) => i.state === "open")
    .filter((i) => (i.labels ?? []).some((l) => l.name === config.agentLabel))
    .map((i) => {
      let blockedBy: number[] = [];
      if ((i.issue_dependencies_summary?.blocked_by ?? 0) > 0) {
        try {
          const deps = gh(
            `api repos/${config.repo}/issues/${i.number}/dependencies/blocked_by --jq "[.[].number]"`
          );
          blockedBy = JSON.parse(deps || "[]");
        } catch {
          // treat as unblocked if API fails
        }
      }
      return { ...i, blockedBy };
    })
    .sort((a, b) => a.number - b.number);
}

function nextUnblocked(issues: SubIssue[], done: Set<number>): SubIssue | undefined {
  return issues.find(
    (i) => !done.has(i.number) && i.blockedBy.every((b) => done.has(b))
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  ensureAuth();

  log(`Fetching PRD #${prdNumber}...`);
  const designPath = fetchDesignPath();
  const allIssues = fetchAllSubIssues();

  if (allIssues.length === 0) {
    log(`No open '${config.agentLabel}' sub-issues found. Nothing to do.`);
    process.exit(0);
  }

  log(`Found ${allIssues.length} open '${config.agentLabel}' sub-issue(s):`);
  for (const t of allIssues) console.log(`  #${t.number} — ${t.title}`);

  if (dryRun) {
    const unblocked: SubIssue[] = [];
    const blocked: SubIssue[] = [];

    // Fetch closed issues to know which blockers are already done
    const closedNumbers = new Set<number>();
    try {
      const closedRaw = gh(
        `api repos/${config.repo}/issues/${prdNumber}/sub_issues --jq "[.[] | select(.state == \"closed\") | .number]"`
      );
      for (const n of JSON.parse(closedRaw || "[]")) closedNumbers.add(n);
    } catch {
      // if fetch fails, treat nothing as closed
    }

    for (const t of allIssues) {
      if (t.blockedBy.every((b) => closedNumbers.has(b))) {
        unblocked.push(t);
      } else {
        blocked.push(t);
      }
    }

    if (unblocked.length > 0) {
      log(`Unblocked (ready to run):`);
      for (const t of unblocked) console.log(`  ✓ #${t.number} — ${t.title}`);
    }
    if (blocked.length > 0) {
      log(`Blocked (waiting on dependencies):`);
      for (const t of blocked) {
        const deps = t.blockedBy.map((b) => `#${b}`).join(", ");
        console.log(`  ✗ #${t.number} — ${t.title}  [blocked by: ${deps}]`);
      }
    }

    log("Dry run — exiting without execution.");
    process.exit(0);
  }

  // Halt before spinning up the sandbox if nothing is actionable right now.
  if (!nextUnblocked(allIssues, new Set<number>())) {
    log(
      `No unblocked '${config.agentLabel}' tasks — all remaining tasks are blocked by open dependencies. Halting.`
    );
    process.exit(1);
  }

  // ─── Branch & Sandbox Lifecycle (#41) ────────────────────────────────────

  const branch = `feature/prd-${prdNumber}`;

  try {
    execSync(`git checkout -b ${branch}`, { stdio: "ignore" });
  } catch {
    execSync(`git checkout ${branch}`, { stdio: "ignore" });
  }
  log(`On branch: ${branch}`);

  await using sandbox = await createSandbox({
    branch,
    sandbox: docker({
      imageName: "kiro-runner",
      mounts: [
        { hostPath: "~/.kiro", sandboxPath: "/home/agent/.kiro", readonly: true },
        { hostPath: "~/.aws", sandboxPath: "/home/agent/.aws" },
        // Login state lives in data.sqlite3 here — required for kiro-cli to
        // consider itself authenticated. Read-only avoids lock contention /
        // state-mixing with a live host session; token refresh uses ~/.aws.
        {
          hostPath: "~/.local/share/kiro-cli",
          sandboxPath: "/home/agent/.local/share/kiro-cli",
          readonly: true,
        },
      ],
    }),
    hooks: {
      sandbox: {
        onSandboxReady: [{ command: config.setup, timeoutMs: 300_000 }],
      },
    },
  });

  log("Sandbox ready.");

  // Run host-side setup (e.g. supabase start) before any tasks.
  if (config.hostSetup) {
    const hostSetupResult = runOnHost(config.hostSetup, "setup");
    if (hostSetupResult.exitCode !== 0) {
      console.error(`Host setup failed:\n${hostSetupResult.output.split("\n").slice(-20).join("\n")}`);
      process.exit(1);
    }
    log("Host setup complete.");
  }

  // Carry the host's git-ignored .env into the workspace so type-check/test see
  // required env vars (e.g. framework `$env` imports). The sandbox worktree is
  // built from the branch, so git-ignored files like .env are never present.
  // base64 round-trips the contents through exec without shell-escaping issues
  // or logging secret values. Generic: only runs if the repo has a root .env.
  const hostEnv = resolve(".env");
  if (existsSync(hostEnv)) {
    const b64 = readFileSync(hostEnv).toString("base64");
    await sandbox.exec(`echo ${b64} | base64 -d > .env`, {
      cwd: "/home/agent/workspace",
    });
    log("Copied host .env into workspace.");
  }

  const logsDir = resolve(".sandcastle", "logs");
  mkdirSync(logsDir, { recursive: true });

  // ─── Task Loop with Verification (#42) ──────────────────────────────────

  const done = new Set<number>();
  const completedTasks: SubIssue[] = [];
  let task: SubIssue | undefined;

  while ((task = nextUnblocked(allIssues, done))) {
    const taskStart = Date.now();
    log(`[task #${task.number}] implementing...`);

    const implPrompt = buildImplementerPrompt(task, designPath);
    const implResult = await sandbox.exec(
      `kiro-cli chat --no-interactive --trust-all-tools --agent implementer "${escapeShell(implPrompt)}"`,
      { cwd: "/home/agent/workspace", onLine: liveStream(`#${task.number} impl`) }
    );
    writeFileSync(
      resolve(logsDir, `${task.number}-implementer.log`),
      implResult.stdout + "\n" + implResult.stderr
    );

    // Post-implementer checks
    log(`[task #${task.number}] verifying...`);
    const postImpl = await runChecks(sandbox);

    let reviewerContext: string;
    if (postImpl.passed) {
      reviewerContext = "Implementer checks passed. Review for code quality.";
    } else {
      reviewerContext = `Implementer checks FAILED:\n${postImpl.output.slice(-2000)}`;
    }

    // Reviewer always runs
    log(`[task #${task.number}] reviewing...`);
    const reviewPrompt = buildReviewerPrompt(task, reviewerContext, designPath);
    const revResult = await sandbox.exec(
      `kiro-cli chat --no-interactive --trust-all-tools --agent reviewer "${escapeShell(reviewPrompt)}"`,
      { cwd: "/home/agent/workspace", onLine: liveStream(`#${task.number} review`) }
    );
    writeFileSync(
      resolve(logsDir, `${task.number}-reviewer.log`),
      revResult.stdout + "\n" + revResult.stderr
    );

    // Final gate
    log(`[task #${task.number}] final checks...`);
    const finalChecks = await runChecks(sandbox);

    if (!finalChecks.passed) {
      const tail = finalChecks.output.split("\n").slice(-30).join("\n");
      console.error(`\n[task #${task.number}] FAILED final checks:\n${tail}`);
      process.exit(1);
    }

    done.add(task.number);
    completedTasks.push(task);
    log(`[task #${task.number}] ✓ passed (${elapsed(taskStart)})`);
  }

  if (completedTasks.length === 0) {
    log("No tasks could be unblocked. Check dependency graph.");
    process.exit(1);
  }

  // ─── Completion: Push & PR (#43) ────────────────────────────────────────

  log("All tasks passed. Pushing...");
  execSync(`git push -u origin ${branch}`, { stdio: "inherit" });

  const prBody = buildPrBody(completedTasks, prdNumber);
  const prUrl = gh(
    `pr create --base main --head ${branch} --title "feat: PRD #${prdNumber}" --body "${escapeShell(prBody)}"`
  );

  log(`✓ ${completedTasks.length} tasks completed. PR: ${prUrl}`);
}

// ─── Verification Logic (#42) ────────────────────────────────────────────────

interface CheckResult {
  passed: boolean;
  output: string;
}

async function runChecks(sandbox: {
  exec: (cmd: string, opts?: { cwd?: string; onLine?: (line: string) => void }) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
}): Promise<CheckResult> {
  const testResult = await sandbox.exec(config.test, { cwd: "/home/agent/workspace", onLine: liveStream("test") });
  if (testResult.exitCode !== 0) {
    return { passed: false, output: `TEST FAILED:\n${testResult.stdout}\n${testResult.stderr}` };
  }

  const typeResult = await sandbox.exec(config.typeCheck, { cwd: "/home/agent/workspace", onLine: liveStream("tsc") });
  if (typeResult.exitCode !== 0) {
    return { passed: false, output: `TYPE-CHECK FAILED:\n${typeResult.stdout}\n${typeResult.stderr}` };
  }

  // Host-side test (e.g. supabase pgTap tests)
  if (config.hostTest) {
    const hostResult = runOnHost(config.hostTest, "test");
    if (hostResult.exitCode !== 0) {
      return { passed: false, output: `HOST TEST FAILED:\n${hostResult.output}` };
    }
  }

  return { passed: true, output: "All checks passed." };
}

// ─── Prompt Builders ─────────────────────────────────────────────────────────

function buildImplementerPrompt(task: SubIssue, designPath?: string): string {
  let prompt = `Implement the following task.\n\n`;
  prompt += `## Task #${task.number}: ${task.title}\n\n${task.body}\n\n`;
  prompt += `## Check commands\n- Test: ${config.test}\n- Type-check: ${config.typeCheck}\n`;
  if (designPath) prompt += `\n## Design context\nRead ${designPath} for architectural decisions.\n`;
  return prompt;
}

function buildReviewerPrompt(task: SubIssue, context: string, designPath?: string): string {
  let prompt = `Review the implementation of the following task.\n\n`;
  prompt += `## Task #${task.number}: ${task.title}\n\n${task.body}\n\n`;
  prompt += `## Context\n${context}\n\n`;
  prompt += `## Check commands\n- Test: ${config.test}\n- Type-check: ${config.typeCheck}\n`;
  if (designPath) prompt += `\n## Design context\nRead ${designPath} for architectural decisions.\n`;
  return prompt;
}

function buildPrBody(tasks: SubIssue[], prd: number): string {
  let body = `## Summary\n\nImplements PRD #${prd}\n\n## Tasks completed\n\n`;
  for (const t of tasks) body += `- Closes #${t.number} — ${t.title}\n`;
  body += `\n---\nParent: #${prd}`;
  return body;
}

function escapeShell(s: string): string {
  return s.replace(/"/g, '\\"').replace(/\$/g, "\\$").replace(/`/g, "\\`");
}

// ─── Run ─────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

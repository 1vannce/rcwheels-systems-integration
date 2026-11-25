// Claude Code Stop hook: before Claude ends a turn with code changes, lint the changed
// files and run the unit tests. On failure it exits with code 2, which sends Claude back
// to fix the problem (exit code 1 would let it stop anyway).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEST_COMMAND = "npm run test:run";
const MAX_RETRIES = 3; // per user turn, so Claude cannot loop forever
const MAX_LINT_FILES = 100; // above this, lint the whole project (Windows caps command length)

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const opts = { cwd: root, encoding: "utf8", env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" } };
const git = (...args) => spawnSync("git", args, opts).stdout ?? "";
const sh = (command) => spawnSync(command, { ...opts, shell: true }); // npm and npx need a shell on Windows
const hash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

// Changed = everything that differs from where this branch left main, committed or not.
const base = git("merge-base", "HEAD", "origin/main").trim() || "HEAD";
const diff = git("diff", base);
const tracked = git("diff", "--name-only", base).split("\n");
const untracked = git("ls-files", "--others", "--exclude-standard").split("\n");
const changed = [...new Set([...tracked, ...untracked])].filter((f) => f && existsSync(join(root, f)));
const code = changed.filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f));
if (code.length === 0 && !changed.some((f) => /(^|\/)package(-lock)?\.json$/.test(f))) process.exit(0);

const stateFile = join(tmpdir(), `claude-stop-checks-${hash(root)}.json`);
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : {};
const key = hash(diff + untracked.map((f) => (f && existsSync(join(root, f)) ? f + statSync(join(root, f)).mtimeMs : "")).join());
const save = (next) => writeFileSync(stateFile, JSON.stringify(next));

// Nothing changed since the last pass, or since the last failure Claude was already told about
// (it chose to explain instead of changing code): let it stop.
if (state.passed === key) process.exit(0);
if (input.stop_hook_active && state.failed === key) process.exit(0);

const failures = [];
const quote = (f) => `"${f.replace(/["$`\\]/g, "\\$&")}"`;
const lintTarget = code.length > MAX_LINT_FILES ? "." : code.map(quote).join(" ");
if (lintTarget) {
  const lint = sh(`npx eslint ${lintTarget}`);
  if (lint.status !== 0) failures.push(["Lint (eslint on changed files)", lint]);
}
const test = sh(TEST_COMMAND);
if (test.status !== 0) failures.push([`Tests (${TEST_COMMAND})`, test]);

if (failures.length === 0) {
  save({ passed: key });
  process.exit(0);
}

// A stop that is not a hook continuation starts a new count, so one bad stretch
// does not switch the hook off for the rest of the session.
const tries = input.stop_hook_active ? (state.tries ?? 0) + 1 : 1;
save({ failed: key, tries });
if (tries > MAX_RETRIES) process.exit(0);

const tail = (r) => `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n").slice(-60).join("\n");
console.error(
  `Checks failed (attempt ${tries} of ${MAX_RETRIES}). Fix them before finishing. ` +
    `If they cannot pass for a reason outside your change, say why and stop without editing again.\n\n` +
    failures.map(([name, r]) => `## ${name}\n${tail(r)}`).join("\n\n"),
);
process.exit(2);

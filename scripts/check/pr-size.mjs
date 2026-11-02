#!/usr/bin/env node
// PR size gate (RULES.md R8): fail when a branch changes more than 600 lines against its base.
// Usage: node scripts/check/pr-size.mjs [base]   (base defaults to $PR_SIZE_BASE or origin/main)
// PR_SIZE_LIMIT can only lower the limit. SIZE_EXCEPTION=<reason> lets a local run pass, not CI.
import { execFileSync } from "node:child_process";

const MAX = 600;
const EXCLUDED = [/(^|\/)package-lock\.json$/, /(^|\/)npm-shrinkwrap\.json$/, /(^|\/)yarn\.lock$/, /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)(dist|build|out|coverage)\//, /\.min\.(js|css)$/, /\.map$/];

const requested = Number.parseInt(process.env.PR_SIZE_LIMIT ?? "", 10);
const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, MAX) : MAX;
const base = process.argv[2] ?? process.env.PR_SIZE_BASE ?? "origin/main";
const git = (...args) => execFileSync("git", args, { encoding: "utf8", shell: false }).trim();

let mergeBase;
try { mergeBase = git("merge-base", base, "HEAD"); }
catch { console.error(`pr-size: blocked, cannot find merge base with ${base}`); process.exit(2); }

let total = 0, excluded = 0, files = 0;
for (const line of git("diff", "--numstat", "--no-renames", mergeBase, "HEAD").split("\n").filter(Boolean)) {
  const [added, deleted, path] = line.split("\t");
  // Binary files report "-"; count them as one changed line each.
  const n = added === "-" ? 1 : Number(added) + Number(deleted);
  if (EXCLUDED.some((re) => re.test(path))) { excluded += n; continue; }
  total += n; files++;
}

const summary = `pr-size: ${total} changed lines in ${files} files against ${base} (limit ${limit}, ${excluded} excluded)`;
if (total <= limit) { console.log(`${summary}: pass`); process.exit(0); }
const exception = process.env.SIZE_EXCEPTION?.trim();
if (exception && !process.env.CI) { console.log(`${summary}: pass by local size exception: ${exception}`); process.exit(0); }
console.log(`${summary}: fail; split into stacked PRs, or add the size-exception label and a "Size exception:" line`);
process.exit(1);

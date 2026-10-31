---
name: land
description: >-
  Land the requested Voice Lab changes on the repository's default branch.
  Invoke only when the user explicitly requests landing or merging, not for
  review, preparation, passing checks, or installing this skill.
disable-model-invocation: true
metadata:
  delta-action: land
---

# Land Voice Lab changes

An invocation from Land Changes or an explicit request to land or merge is
authorization to perform this workflow, including publication and merging.
Do not ask for that same authorization again. Stop for genuine blockers,
unresolved scope, or a required permission rather than bypassing a safeguard.

## Identify the change and destination

1. Inspect the thread's requested change, applicable `AGENT.md`/`AGENTS.md`
   instructions, `git status`, the diff including untracked files, the current
   branch, and configured remotes. If running in a subthread, establish which
   parent-thread changes are actually present; do not treat an incomplete
   snapshot or an unfinished feature as a completed change.
2. Identify the publication remote and destination from the repository and
   GitHub settings, not the `local` backlink. The repository currently uses
   `origin` for GitHub and `main` as its default branch; verify both at execution
   time. Confirm `gh` authentication and the permissions, merge methods, branch
   protections, rulesets and review requirements applicable to the destination.
   If any required permission or rule cannot be verified or satisfied, stop and
   explain the blocker.
3. Preserve unrelated work. Determine the exact files and hunks belonging to
   the requested change; do not blindly stage everything. If changes are mixed
   or cannot safely be separated, ask the user to resolve the scope. Do not
   reset, clean, overwrite, force-push, or rewrite shared history.

## Contribution and verification requirements

Follow `CONTRIBUTING.md` and applicable instructions. Keep the change focused;
add unit tests for deterministic logic and browser tests for user workflows.
Update requirements for product behavior changes and record architectural
tradeoffs where applicable. Include the lockfile when dependencies change;
review dependency licenses and browser compatibility before adding DSP
libraries. Contributions must be MIT-compatible. Do not commit secrets or
unconsented personal recordings, add telemetry or audio-bearing network
requests, or make unsupported calibration, medical, mobile or accuracy claims.
Use synthetic fixtures where possible.

Use a supported Node version from `package.json` (`.nvmrc` selects Node 24).
Install project dependencies when needed with `npm ci` (`package.json` and
`.github/workflows/ci.yml`). Ensure Chromium is available; if browser
installation or another prerequisite requires user action, explain it and stop.
Run these checks sequentially, without a concurrently running suite on the
shared test port:

- `npm run check` — unit tests, TypeScript/build and license audit
  (`package.json`, script `check`; `.github/workflows/ci.yml`).
- `npm run test:e2e` — built-app browser workflows (`package.json`, script
  `test:e2e`; `.github/workflows/ci.yml`).
- `npm run test:e2e:dev` — development-server browser workflows
  (`package.json`, script `test:e2e:dev`; `.github/workflows/ci.yml`).

Run additional relevant checks for the specific changes. Do not treat a
previous run, a partially completed suite, or a failure as a pass. Explain
behavior changes, validation and known limitations in the pull-request review
description, as required by `CONTRIBUTING.md`.

## Publish, land and verify

1. Fetch the verified publication remote. Create or use a focused non-default
   branch based on the current target, stage only the identified changes, and
   make a descriptive non-interactive commit. Preserve pre-existing commits and
   unrelated work. If conflicts arise, resolve them automatically only when the
   intended result is clear and unrelated work is preserved; stop and ask the
   user if the resolution is ambiguous or unsafe. Re-run affected checks after
   any change and ensure the final commit is the one verified.
2. Push the branch to the verified publication remote, not `local`, and create
   or update a pull request targeting the verified default branch. Do not
   silently switch targets, bypass required reviews, or assume direct pushes
   are acceptable. The repository's CI workflow runs on pushes and pull
   requests (`.github/workflows/ci.yml`).
3. Check the pull request's current head SHA and all applicable GitHub checks,
   reviews and destination rules. Wait within the terminal's bounded runtime
   for checks when appropriate; if required checks are missing, pending,
   failing, stale or unverifiable, stop and report that the change has not
   landed. Ensure checks correspond to the exact head to be merged. Re-check
   the target and mergeability immediately before merging.
4. Merge the pull request with a merge commit when permitted, using `gh pr
   merge --merge` and a head-SHA guard. If the destination requires a different
   method or a required permission is unavailable, stop rather than overriding
   the rules. Verify through GitHub that the PR is merged and that the resulting
   merge commit is on the intended target branch. The Pages deployment workflow
   runs on pushes to `main` (`.github/workflows/deploy-pages.yml`); report its
   actual result separately if relevant, without treating deployment as the
   Git landing itself.
5. Avoid destructive cleanup or modifying the user's primary checkout. Report
   the actual destination, verified merge commit, checks and any remaining
   deployment or cleanup work.

## Outcome reporting

When running in a subthread and `report_subthread_status` is available, report
the landing outcome to the parent; otherwise report directly in the current
conversation. Use `success` only after verifying the change reached the
intended target. Use `failure` for a failed attempt or genuine blocker, and
say explicitly that the change has not landed. A prepared commit, pushed branch,
PR, passing local build or installed skill is not landing success. Recovery may
continue when safe; report the updated outcome after verification.

Keep status titles to a few sentence-case words and descriptions to one short
line. Link the short commit SHA and the actual CI check or run result only when
their URLs are verified; omit unavailable links rather than inventing them.
Keep questions in the conversation, not the status event. For example:

- `success`: **Landed on main** — `[abc1234](verified-commit-url) · [CI passed](verified-ci-url).`
- `failure`: **Blocked by CI** — `[Tests failed](verified-ci-url) for [abc1234](verified-commit-url). Not landed.`
- `failure`: **Push blocked** — `[abc1234](verified-commit-url) passed [CI](verified-ci-url); push access required.`

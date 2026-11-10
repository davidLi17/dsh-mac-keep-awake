# Fork maintenance

## 2026-11-10 — 26.11.10-lhg

- Add an explicit DSH 0.2.2-rc.1 compatibility declaration backed by the official CLI installation and a real rc1 service integration, not only a permissive version range. Official source: `66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db`. Upstream remains `7b6ca75395b097dee4313b4abd205ea43b5b0e38`; no upstream change to merge.
- New opt-in `test:host` checks real AgentLoop running/idle signals, scoped event delivery, disable and hot reload, durable compaction events, real agent disposal and plugin cleanup. Model and caffeinate are simulated; no network model call or OS power assertion is made.
- Original runtime, MIT notice, enabled switch and installation archive safety are unchanged. Linux tests pass; 15 native macOS tests remain skipped. No workflow exists in this repository. No npm publication, package upload or user installation change.

## 2026-11-09 — 26.11.9-lhg

- Fork base: `1d33f6341226e3e98e36935a9a40302094d0182d` (1.4.2). The MIT-licensed upstream `wjvalue/dsh-mac-keep-awake` remains at `7b6ca75395b097dee4313b4abd205ea43b5b0e38`; there are no new upstream commits to absorb.
- Fixed the existing installation script's archive contents: the staged archive now includes the original MIT license and both README files, matching the documentation and license included by `npm pack`. Previously, the script only included the runtime files, manifest and patch.
- Added isolated installation tests for paths with spaces, archive contents and byte preservation, default and named profiles, and preservation of a previously pinned archive. Tests only stage files in a temporary home; they do not install into a real DSH profile.
- Preserved the fork's `enabled` switch, all runtime source, patch configuration, sleep behavior, existing permissions and original MIT notice. Updated the version and installation examples for this packaging fix; the unchanged upstream does not by itself trigger a version bump.
- Validation: 48 tests passed; 15 macOS-specific tests skipped on Linux; all JavaScript syntax checks; exported plugin import; `npm pack --dry-run`; real installation-script staging and archive-content checks in an isolated home. No live macOS `pmset`/`caffeinate` or DSH GUI test was performed.
- This repository has no build script or GitHub Actions workflow. No npm publication, release/archive upload, workflow, permission or account changes were made.

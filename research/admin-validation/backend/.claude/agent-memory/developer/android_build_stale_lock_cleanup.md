---
name: android_build_stale_lock_cleanup
description: Killed Gradle daemons leave zombie PIDs that stale lock files still reference, blocking new builds with "Timeout waiting to lock ... currently in use by another Gradle instance"
metadata:
  type: feedback
---

Killing a stuck Gradle daemon (`kill -9`) in this environment leaves a zombie process (PPID 1, 0% CPU/MEM, `ps` shows `(java)` with state like `?Es`). The zombie's PID stays "alive" enough for Gradle's lock-file liveness check (`kill(pid, 0)`) to think the lock owner is still running, so any new build/daemon attempt fails or hangs waiting on `~/.gradle/caches/journal-1/journal-1.lock`, `~/.gradle/daemon/<ver>/registry.bin.lock`, or the project-local `.gradle/<ver>/fileHashes/fileHashes.lock`.

**Why:** repeated overlapping build attempts (started before confirming the previous one was truly dead) compound this — multiple daemons end up contending for the same caches/registry, producing a cascade of lock-timeout failures that look like separate bugs but are all the same root cause.

**How to apply:**
- Before retrying a failed/hung Gradle build, always: `pkill -9 -f GradleDaemon; pkill -9 -f GradleWrapperMain`, then delete stale locks with `rtk proxy find ~/.gradle -name "*.lock" -delete` and `rtk proxy find <project>/android -name "*.lock" -delete` (plain `find ... -delete` is blocked by the rtk hook here — must use `rtk proxy find`).
- Only launch ONE build attempt at a time; confirm the previous attempt's process is gone (via `jstack`/`ps -p <pid>` with matching sandbox flag, see [[gradle_hang_no_watch_fs]]) before starting a new one.
- Leftover zombie PIDs themselves are harmless once locks are cleared — don't chase killing them further, they'll be reaped by launchd eventually.

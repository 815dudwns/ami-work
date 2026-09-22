---
name: gradle-hang-no-watch-fs
description: Gradle Android build hangs indefinitely after "Executing build with daemon context" in this sandboxed macOS environment — fix is --no-watch-fs
metadata:
  type: feedback
---

Gradle daemon builds (`./gradlew :app:assembleDebug`) hang forever right after the daemon logs "The daemon has started executing the build" / "Configuring env variables" — 0% CPU, thread dump shows main thread idle in `awaitExpiration`, no compile task running. This happened repeatedly across awms-queue, likely applies to any Android/Gradle project built from this agent environment.

**Why:** Gradle's default file-system-watching (VFS watch, introduced by default in modern Gradle) relies on native FSEvents/inotify hooks that don't behave correctly in this sandboxed/headless environment, so the build silently deadlocks waiting on the watcher instead of failing fast.

**How to apply:**
- Always add `--no-watch-fs` to any `./gradlew` build/assemble invocation run from this agent (Bash tool), e.g. `./gradlew :app:assembleDebug --console=plain --no-daemon --no-watch-fs`.
- Also use `--no-daemon` and redirect stdin from `/dev/null` (`< /dev/null`) to avoid any interactive-prompt hang.
- Diagnose a suspected hang via `jstack <pid>` (path: `/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/jstack`) — if main thread is in `awaitExpiration`/idle and no compiler threads have work, it's this issue, not a slow compile.
- Launch long Gradle builds with the Bash tool's own `run_in_background: true` (not manual `nohup ... &`) plus `dangerouslyDisableSandbox: true` consistently for the launch AND every subsequent `ps`/`jstack`/`kill` check on it — mismatched sandbox flags between calls make processes/zombies appear to "vanish" or be invisible, causing false debugging leads. See [[android_build_stale_lock_cleanup]].

# Task Context — sport-host-build

- Goal: Verify the sport-host KMP app compiles and passes its build gate at `/Users/linhn/sport-host`. Run `./gradlew :composeApp:compileDebugKotlinAndroid` with JDK 17+ and confirm BUILD SUCCESSFUL. If the build fails, diagnose the root cause (JDK version mismatch, AGP/KMP incompatibility, Kotlin/Gradle version ceiling) and report it.
- Definition of Done: The compile gate exits with BUILD SUCCESSFUL; OR, if it fails, a concrete diagnosis of the failure is recorded in `.vibeflow/workunits/sport-host-build/evidence/` with the command output attached.
- Must not change: Any file outside `.vibeflow/TASK_CONTEXT.md` and `.vibeflow/workunits/sport-host-build/evidence/`. No source, no config, no generated files in the sport-host repo itself. This is a read-only verification of the sport-host build — do NOT modify sport-host code.

## Pre-requisites (from memory)
- JDK 17+: `export JAVA_HOME=/Users/linhn/.sdkman/candidates/java/17.0.11-amzn`
- AGP bypass in `gradle.properties`: `android.builtInKotlin=false` + `android.newDsl=false`
- Version ceiling: Kotlin ≤2.4.0, AGP ≤9.1.x, Gradle ≤9.5.0

## Evidence
- Capture stdout/stderr of the compile gate command.
- Record whether the build passed or the concrete failure reason.
- Append a dated entry to `.vibeflow/knowledge/log.md` with the result.

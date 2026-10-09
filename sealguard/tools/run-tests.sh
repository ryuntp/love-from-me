#!/usr/bin/env bash
# Compiles app/src/main plus app/src/test against android.jar and runs every *Test class with JUnit 4.
# Tests cover the pure-Kotlin domain logic; android.jar classes throw "Stub!" if touched at runtime.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLCHAIN="${SEALGUARD_TOOLCHAIN:-$HOME/.cache/sealguard-toolchain}"
# shellcheck disable=SC1091
source "$TOOLCHAIN/env.sh"

APP="$ROOT/app"
OUT="$ROOT/build/test"
rm -rf "$OUT"
mkdir -p "$OUT/main" "$OUT/test"

LIBS_CP=""
for jar in "$APP"/libs/*.jar; do
	[ -f "$jar" ] && LIBS_CP="$LIBS_CP:$jar"
done
JAVA_SOURCES="$(find "$APP/src/main" -name '*.java' 2>/dev/null || true)"
if [ -n "$JAVA_SOURCES" ]; then
	# shellcheck disable=SC2086
	javac --release 8 -Xlint:-options -nowarn -cp "$ANDROID_JAR$LIBS_CP" -d "$OUT/main" $JAVA_SOURCES
fi
"$KOTLINC" -jvm-target 1.8 -Werror -nowarn -no-reflect -no-stdlib \
	-cp "$ANDROID_JAR:$KOTLIN_STDLIB:$OUT/main$LIBS_CP" -d "$OUT/main" "$APP/src/main" 2>&1 | grep -v JAVA_TOOL_OPTIONS || true
"$KOTLINC" -jvm-target 1.8 -Werror -nowarn -no-reflect -no-stdlib \
	-cp "$ANDROID_JAR:$KOTLIN_STDLIB:$OUT/main:$JUNIT_CP$LIBS_CP" -d "$OUT/test" "$APP/src/test" 2>&1 | grep -v JAVA_TOOL_OPTIONS || true

TESTS="$(cd "$OUT/test" && find . -name '*Test.class' | sed 's#^\./##; s#\.class$##; s#/#.#g' | sort | tr '\n' ' ')"
[ -n "$TESTS" ] || { echo "no test classes found" >&2; exit 1; }
# shellcheck disable=SC2086
java -cp "$OUT/test:$OUT/main:$KOTLIN_STDLIB:$JUNIT_CP:$ANDROID_JAR$LIBS_CP" org.junit.runner.JUnitCore $TESTS 2>&1 | grep -v JAVA_TOOL_OPTIONS

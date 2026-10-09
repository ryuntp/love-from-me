#!/usr/bin/env bash
# Runs the UI unit tests (node --test over ui-tests/) and, when app/src/test exists, compiles app/src/main plus
# app/src/test against android.jar and runs every *Test class with JUnit 4. Android classes throw "Stub!" if touched.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "[ui] node --test"
node --test "$ROOT"/ui-tests/*.test.mjs

if [ ! -d "$ROOT/app/src/test" ]; then
	echo "[kotlin] no app/src/test directory, skipping"
	exit 0
fi
echo "[kotlin] junit"
TOOLCHAIN="${SEALGUARD_TOOLCHAIN:-$HOME/.cache/sealguard-toolchain}"
# shellcheck disable=SC1091
source "$TOOLCHAIN/env.sh"
# shellcheck disable=SC1091
source "$ROOT/tools/lib.sh"

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
jvm "$KOTLINC" -jvm-target 1.8 -Werror -nowarn -no-reflect -no-stdlib \
	-cp "$ANDROID_JAR:$KOTLIN_STDLIB:$OUT/main$LIBS_CP" -d "$OUT/main" "$APP/src/main"
jvm "$KOTLINC" -jvm-target 1.8 -Werror -nowarn -no-reflect -no-stdlib \
	-cp "$ANDROID_JAR:$KOTLIN_STDLIB:$OUT/main:$JUNIT_CP$LIBS_CP" -d "$OUT/test" "$APP/src/test"

TESTS="$(cd "$OUT/test" && find . -name '*Test.class' | sed 's#^\./##; s#\.class$##; s#/#.#g' | sort | tr '\n' ' ')"
[ -n "$TESTS" ] || { echo "no test classes found" >&2; exit 1; }
# shellcheck disable=SC2086
jvm java -cp "$OUT/test:$OUT/main:$KOTLIN_STDLIB:$JUNIT_CP:$ANDROID_JAR$LIBS_CP" org.junit.runner.JUnitCore $TESTS

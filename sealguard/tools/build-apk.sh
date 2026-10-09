#!/usr/bin/env bash
# Builds and signs the SealGuard APK without the Android SDK or Gradle.
# Pipeline: aapt2 (resources, manifest, R.java) -> javac + kotlinc -> dx -> zip -> zipalign -> apksigner.
# Run tools/bootstrap-toolchain.sh once first.
#
# Usage: tools/build-apk.sh [--release]   (release needs RELEASE_KEYSTORE, RELEASE_KEY_ALIAS, RELEASE_KS_PASS, RELEASE_KEY_PASS)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLCHAIN="${SEALGUARD_TOOLCHAIN:-$HOME/.cache/sealguard-toolchain}"
# shellcheck disable=SC1091
source "$TOOLCHAIN/env.sh"
# shellcheck disable=SC1091
source "$ROOT/tools/lib.sh"

APP="$ROOT/app"
OUT="$ROOT/build/apk"
MIN_SDK=29
TARGET_SDK=29
VARIANT=debug
[ "${1:-}" = "--release" ] && VARIANT=release

rm -rf "$OUT"
mkdir -p "$OUT/classes" "$OUT/gen" "$OUT/libs"

echo "[1/6] resources"
aapt2 compile --dir "$APP/res" -o "$OUT/res.zip"
aapt2 link -o "$OUT/base.apk" -I "$ANDROID_JAR" \
	--manifest "$APP/AndroidManifest.xml" --java "$OUT/gen" \
	--min-sdk-version "$MIN_SDK" --target-sdk-version "$TARGET_SDK" \
	--auto-add-overlay "$OUT/res.zip"

echo "[2/6] compile"
LIBS_CP=""
for jar in "$APP"/libs/*.jar; do
	[ -f "$jar" ] && LIBS_CP="$LIBS_CP:$jar"
done
JAVA_SOURCES="$(find "$OUT/gen" "$APP/src/main" -name '*.java' 2>/dev/null || true)"
if [ -n "$JAVA_SOURCES" ]; then
	# shellcheck disable=SC2086
	javac --release 8 -Xlint:-options -nowarn -cp "$ANDROID_JAR$LIBS_CP" -d "$OUT/classes" $JAVA_SOURCES
fi
# dx has no desugaring, so lambdas and SAM conversions compile to classes and string concat stays inline.
jvm "$KOTLINC" -jvm-target 1.8 -Xlambdas=class -Xsam-conversions=class -Xstring-concat=inline \
	-Werror -nowarn -no-reflect -no-stdlib \
	-cp "$ANDROID_JAR:$KOTLIN_STDLIB:$OUT/classes$LIBS_CP" -d "$OUT/classes" "$APP/src/main"
[ -n "$(find "$OUT/classes" -name '*.class' | head -1)" ] || { echo "no classes compiled" >&2; exit 1; }

echo "[3/6] dex"
flatten() {
	# dx aborts on multi-release jars; drop the Java 9+ metadata it cannot read.
	cp "$1" "$2"
	zip -q -d "$2" 'META-INF/versions/*' 'module-info.class' >/dev/null 2>&1 || true
}
flatten "$KOTLIN_STDLIB" "$OUT/libs/kotlin-stdlib.jar"
for jar in "$APP"/libs/*.jar; do
	[ -f "$jar" ] && flatten "$jar" "$OUT/libs/$(basename "$jar")"
done
jvm dalvik-exchange --dex --min-sdk-version="$MIN_SDK" --output="$OUT/classes.dex" "$OUT/classes" "$OUT"/libs/*.jar
[ -f "$OUT/classes.dex" ] || { echo "dex failed" >&2; exit 1; }

echo "[4/6] package"
cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT" && zip -q -u unsigned.apk classes.dex)
if [ -d "$APP/assets" ]; then
	(cd "$APP" && zip -q -r "$OUT/unsigned.apk" assets)
fi

echo "[5/6] align + sign ($VARIANT)"
zipalign -p -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
APK="$ROOT/build/sealguard-$VARIANT.apk"
if [ "$VARIANT" = release ]; then
	jvm apksigner sign --ks "$RELEASE_KEYSTORE" --ks-key-alias "$RELEASE_KEY_ALIAS" \
		--ks-pass "pass:$RELEASE_KS_PASS" --key-pass "pass:$RELEASE_KEY_PASS" \
		--v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
		--out "$APK" "$OUT/aligned.apk"
else
	jvm apksigner sign --ks "$DEBUG_KEYSTORE" --ks-pass pass:android --key-pass pass:android \
		--v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
		--out "$APK" "$OUT/aligned.apk"
fi

echo "[6/6] verify"
jvm apksigner verify --verbose "$APK" | sed -n '1,4p'
aapt2 dump badging "$APK" | grep -E "^package|^sdkVersion|^targetSdkVersion|^application-label:|uses-permission" | sed 's/^/  /'
ls -la "$APK"

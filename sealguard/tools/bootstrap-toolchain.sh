#!/usr/bin/env bash
# Installs everything build-apk.sh and run-tests.sh need, without the Android SDK.
# Works where dl.google.com is unreachable: Ubuntu packages give aapt2, apksigner,
# zipalign and dx; GitHub gives kotlinc and android.jar; Maven Central gives JUnit.
set -euo pipefail

TOOLCHAIN="${SEALGUARD_TOOLCHAIN:-$HOME/.cache/sealguard-toolchain}"
KOTLIN_VERSION=2.0.21
KOTLIN_SHA256=0352c0a45bd22f80f6b26e485cd04da8047baa5de54865281fb9f89a4a7bcf2a
ANDROID_PLATFORMS_COMMIT=1e98db1a199e8f7f85541af26bfc27019501b132
ANDROID_JAR_SHA256=6cea1df3efb77103ac3e2beb9bf4718964b0e0869ab16d39d29d5cbae1c147ad
JUNIT_SHA256=8e495b634469d64fb8acfa3495a065cbacc8a0fff55ce1e31007be4c16dc57d3
HAMCREST_SHA256=66fdef91e9739348df7a096aa384a5685f4e875584cce89386a7a47251c4d8e9

mkdir -p "$TOOLCHAIN/lib"
cd "$TOOLCHAIN"

need_apt=()
for bin in aapt2 apksigner zipalign dalvik-exchange unzip zip curl git; do
	command -v "$bin" >/dev/null 2>&1 || need_apt+=("$bin")
done
if [ "${#need_apt[@]}" -gt 0 ]; then
	echo "installing apt packages for: ${need_apt[*]}"
	sudo_cmd=""
	[ "$(id -u)" -ne 0 ] && sudo_cmd=sudo
	$sudo_cmd apt-get update -qq
	DEBIAN_FRONTEND=noninteractive $sudo_cmd apt-get install -y -qq aapt apksigner zipalign dalvik-exchange unzip zip curl git
fi

verify() {
	local file="$1" expected="$2"
	local actual
	actual="$(sha256sum "$file" | cut -d' ' -f1)"
	if [ "$actual" != "$expected" ]; then
		echo "checksum mismatch for $file: got $actual, expected $expected" >&2
		exit 1
	fi
}

if [ ! -x kotlinc/bin/kotlinc ]; then
	echo "downloading kotlin compiler $KOTLIN_VERSION"
	curl -sS -L --fail --retry 4 --retry-delay 5 -o kotlin-compiler.zip \
		"https://github.com/JetBrains/kotlin/releases/download/v$KOTLIN_VERSION/kotlin-compiler-$KOTLIN_VERSION.zip"
	verify kotlin-compiler.zip "$KOTLIN_SHA256"
	rm -rf kotlinc
	unzip -q kotlin-compiler.zip
	rm kotlin-compiler.zip
fi

if [ ! -f android.jar ]; then
	echo "fetching android.jar (API 34) from Sable/android-platforms@$ANDROID_PLATFORMS_COMMIT"
	rm -rf android-platforms
	git clone -q --filter=blob:none --sparse https://github.com/Sable/android-platforms android-platforms
	git -C android-platforms checkout -q "$ANDROID_PLATFORMS_COMMIT"
	git -C android-platforms sparse-checkout set android-34
	cp android-platforms/android-34/android.jar android.jar
	rm -rf android-platforms
	verify android.jar "$ANDROID_JAR_SHA256"
fi

fetch_jar() {
	local path="$1" sha="$2" out="lib/$(basename "$1")"
	if [ ! -f "$out" ]; then
		curl -sS -L --fail --retry 8 --retry-delay 5 --retry-all-errors -o "$out" "https://repo.maven.apache.org/maven2/$path"
		verify "$out" "$sha"
	fi
}
fetch_jar junit/junit/4.13.2/junit-4.13.2.jar "$JUNIT_SHA256"
fetch_jar org/hamcrest/hamcrest-core/1.3/hamcrest-core-1.3.jar "$HAMCREST_SHA256"

if [ ! -f debug.keystore ]; then
	keytool -genkeypair -keystore debug.keystore -storepass android -keypass android \
		-alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 \
		-dname "CN=Android Debug,O=Android,C=US" >/dev/null 2>&1
fi

cat > env.sh <<ENV
export SEALGUARD_TOOLCHAIN="$TOOLCHAIN"
export ANDROID_JAR="$TOOLCHAIN/android.jar"
export KOTLINC="$TOOLCHAIN/kotlinc/bin/kotlinc"
export KOTLIN_STDLIB="$TOOLCHAIN/kotlinc/lib/kotlin-stdlib.jar"
export JUNIT_CP="$TOOLCHAIN/lib/junit-4.13.2.jar:$TOOLCHAIN/lib/hamcrest-core-1.3.jar"
export DEBUG_KEYSTORE="$TOOLCHAIN/debug.keystore"
ENV
echo "toolchain ready at $TOOLCHAIN"
"$TOOLCHAIN/kotlinc/bin/kotlinc" -version 2>&1 | grep -v JAVA_TOOL_OPTIONS || true

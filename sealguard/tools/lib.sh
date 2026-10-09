# Shared by build-apk.sh and run-tests.sh.
# Runs a JVM tool, drops the JAVA_TOOL_OPTIONS banner the sandbox JVM prints, and keeps the tool's exit status.
# The status is caught on the same line, because under set -e a failing command inside a function ends the script
# before the captured output is printed.
jvm() {
	local log status=0
	log="$(mktemp)"
	"$@" >"$log" 2>&1 || status=$?
	grep -v 'Picked up JAVA_TOOL_OPTIONS' "$log" || true
	rm -f "$log"
	return $status
}

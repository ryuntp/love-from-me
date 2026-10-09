# Shared by build-apk.sh and run-tests.sh.
# Runs a JVM tool, drops the JAVA_TOOL_OPTIONS banner the sandbox JVM prints, and keeps the tool's exit status.
jvm() {
	local log status
	log="$(mktemp)"
	"$@" >"$log" 2>&1
	status=$?
	grep -v 'Picked up JAVA_TOOL_OPTIONS' "$log" || true
	rm -f "$log"
	return $status
}

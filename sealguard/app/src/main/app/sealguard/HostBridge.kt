package app.sealguard

import android.content.res.Configuration
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject

// The page's host adapter. Commands arrive as JSON text through post; replies go back through window.sealguardReceive.
// This build carries no vehicle link, so it answers hello with an honest status and ignores every other command.
class HostBridge(private val web: WebView, private val version: String) {
	@Volatile private var helloSeen = false

	@JavascriptInterface
	fun post(text: String) {
		val kind = try {
			val obj = JSONObject(text)
			if (obj.has("t")) obj.optString("t") else obj.optString("kind")
		} catch (e: Exception) {
			""
		}
		if (kind == "hello") {
			helloSeen = true
			reply(status())
			reply(JSONObject().put("v", 1).put("t", "events").put("events", JSONArray()))
		}
	}

	// Sends the current status unprompted, which is how a theme change reaches the page; before hello the page has no receiver yet.
	fun pushStatus() {
		if (helloSeen) reply(status())
	}

	private fun status(): JSONObject {
		val night = web.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
		val selfTest = JSONArray().put(
			JSONObject().put("name", "Vehicle link").put("ok", false)
				.put("detail", "This build has no vehicle link. Screens stay empty until one is added.")
		)
		return JSONObject()
			.put("v", 1).put("t", "status")
			.put("version", version)
			.put("killed", false)
			.put("theme", if (night == Configuration.UI_MODE_NIGHT_YES) "dark" else "light")
			.put("autostart", "unknown")
			.put("watch", JSONObject.NULL).put("recording", JSONObject.NULL).put("lapse", JSONObject.NULL)
			.put("cameras", JSONArray()).put("mosaic", JSONObject.NULL)
			.put("selfTest", selfTest)
	}

	private fun reply(message: JSONObject) {
		val js = "window.sealguardReceive(" + JSONObject.quote(message.toString()) + ")"
		web.post { web.evaluateJavascript(js, null) }
	}
}

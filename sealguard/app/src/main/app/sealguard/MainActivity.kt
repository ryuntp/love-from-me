package app.sealguard

import android.app.Activity
import android.content.res.Configuration
import android.os.Bundle
import android.webkit.WebView

class MainActivity : Activity() {
	private lateinit var web: WebView
	private lateinit var bridge: HostBridge

	@Suppress("DEPRECATION")
	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		web = WebView(this)
		web.settings.javaScriptEnabled = true
		web.settings.domStorageEnabled = true
		web.settings.allowFileAccessFromFileURLs = true
		web.setBackgroundColor(0xFF000000.toInt())
		bridge = HostBridge(web, versionName())
		web.addJavascriptInterface(bridge, "SealGuardHost")
		setContentView(web)
		web.loadUrl("file:///android_asset/ui/index.html")
	}

	// uiMode is in configChanges, so a day or night switch on the head unit lands here instead of recreating the
	// activity; the page learns of it only from a fresh status.
	override fun onConfigurationChanged(newConfig: Configuration) {
		super.onConfigurationChanged(newConfig)
		bridge.pushStatus()
	}

	@Suppress("DEPRECATION")
	private fun versionName(): String = packageManager.getPackageInfo(packageName, 0).versionName ?: "0"

	@Deprecated("Android 13 replaced this with OnBackInvokedCallback; the head unit runs Android 10")
	@Suppress("DEPRECATION")
	override fun onBackPressed() {
		if (web.canGoBack()) web.goBack() else super.onBackPressed()
	}
}

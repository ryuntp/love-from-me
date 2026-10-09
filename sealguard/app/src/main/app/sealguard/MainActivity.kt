package app.sealguard

import android.app.Activity
import android.os.Bundle
import android.webkit.WebView

class MainActivity : Activity() {
	private lateinit var web: WebView

	@Suppress("DEPRECATION")
	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		web = WebView(this)
		web.settings.javaScriptEnabled = true
		web.settings.domStorageEnabled = true
		web.settings.allowFileAccessFromFileURLs = true
		web.setBackgroundColor(0xFF000000.toInt())
		web.addJavascriptInterface(HostBridge(web, versionName()), "SealGuardHost")
		setContentView(web)
		web.loadUrl("file:///android_asset/ui/index.html")
	}

	@Suppress("DEPRECATION")
	private fun versionName(): String = packageManager.getPackageInfo(packageName, 0).versionName ?: "0"

	@Deprecated("Android 13 replaced this with OnBackInvokedCallback; the head unit runs Android 10")
	@Suppress("DEPRECATION")
	override fun onBackPressed() {
		if (web.canGoBack()) web.goBack() else super.onBackPressed()
	}
}

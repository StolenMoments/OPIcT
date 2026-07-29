package shop.mygreed.opict

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.os.Message
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.PermissionRequest
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowCompat

class MainActivity : ComponentActivity() {
    private lateinit var root: FrameLayout
    private lateinit var progress: ProgressBar
    private lateinit var errorOverlay: LinearLayout
    private lateinit var errorMessage: TextView
    private var webView: WebView? = null
    private var failedUrl: String = START_URL
    private var mainFrameUrl: String? = null
    private var navigationFailed = false
    private var pendingAudioPermissionRequest: PermissionRequest? = null
    private val microphonePermissionFlow = MicrophonePermissionFlow()

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WebView.setWebContentsDebuggingEnabled(
            applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0,
        )

        buildShell()
        applyWebTheme(dark = true)
        createWebView(savedInstanceState)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val current = webView
                if (current?.canGoBack() == true) current.goBack() else finish()
            }
        })
    }

    private fun buildShell() {
        root = FrameLayout(this).apply {
            setBackgroundColor(getColor(R.color.shell_background))
        }
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        setContentView(root)

        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            visibility = View.GONE
        }
        root.addView(
            progress,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3), Gravity.TOP),
        )

        val title = TextView(this).apply {
            text = getString(R.string.web_error_title)
            textSize = 20f
            setTextColor(getColor(R.color.shell_foreground))
            gravity = Gravity.CENTER
        }
        errorMessage = TextView(this).apply {
            textSize = 15f
            setTextColor(getColor(R.color.shell_foreground))
            gravity = Gravity.CENTER
        }
        val retry = Button(this).apply {
            text = getString(R.string.retry)
            setOnClickListener { retry() }
        }
        errorOverlay = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            visibility = View.GONE
            setPadding(dp(32), dp(32), dp(32), dp(32))
            addView(title, linearParams(top = 0))
            addView(errorMessage, linearParams(top = 12))
            addView(retry, linearParams(top = 20))
        }
        root.addView(
            errorOverlay,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
        )
        root.requestApplyInsets()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView(savedState: Bundle?) {
        val view = WebView(this).apply webView@{
            setBackgroundColor(Color.TRANSPARENT)
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = false
                allowContentAccess = false
                @Suppress("DEPRECATION")
                allowFileAccessFromFileURLs = false
                @Suppress("DEPRECATION")
                allowUniversalAccessFromFileURLs = false
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                javaScriptCanOpenWindowsAutomatically = false
                setSupportMultipleWindows(true)
                safeBrowsingEnabled = true
            }
            CookieManager.getInstance().apply {
                setAcceptCookie(true)
                setAcceptThirdPartyCookies(this@webView, false)
            }
            addJavascriptInterface(OpictAndroidBridge(), "opictAndroid")
            webViewClient = ShellWebViewClient()
            webChromeClient = ShellChromeClient()
        }
        webView = view
        root.addView(
            view,
            0,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
        )
        if (savedState == null || view.restoreState(savedState) == null) {
            view.loadUrl(START_URL)
        }
    }

    private inner class ShellWebViewClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            if (!request.isForMainFrame) return false
            return handleNavigation(request.url, view, false)
        }

        override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
            mainFrameUrl = url
            navigationFailed = false
            errorOverlay.visibility = View.GONE
        }

        override fun onPageFinished(view: WebView, url: String) {
            if (!navigationFailed) errorOverlay.visibility = View.GONE
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) showError(request.url.toString(), R.string.web_error_network)
        }

        override fun onReceivedHttpError(
            view: WebView,
            request: WebResourceRequest,
            errorResponse: WebResourceResponse,
        ) {
            if (request.isForMainFrame && errorResponse.statusCode >= 400) {
                showError(request.url.toString(), R.string.web_error_http)
            }
        }

        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
            handler.cancel()
            if (error.url == mainFrameUrl || error.url == view.url) {
                showError(error.url, R.string.web_error_ssl)
            }
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            disposeWebView(view)
            showError(START_URL, R.string.web_error_renderer)
            return true
        }
    }

    private inner class OpictAndroidBridge {
        @JavascriptInterface
        fun requestMicrophonePermission() {
            runOnUiThread { handleNativeMicrophonePermissionRequest() }
        }

        @JavascriptInterface
        fun setTheme(dark: Boolean) {
            runOnUiThread { applyWebTheme(dark) }
        }
    }

    internal fun applyWebTheme(dark: Boolean) {
        val background = getColor(
            if (dark) R.color.shell_background_dark else R.color.shell_background_light,
        )
        root.setBackgroundColor(background)
        window.navigationBarColor = background
        window.statusBarColor = Color.TRANSPARENT
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
    }

    private fun handleNativeMicrophonePermissionRequest() {
        when (
            microphonePermissionFlow.begin(
                checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED,
            )
        ) {
            MicrophonePermissionAction.REQUEST -> {
                requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), NATIVE_AUDIO_PERMISSION_REQUEST_CODE)
            }
            MicrophonePermissionAction.NOTIFY_GRANTED -> notifyMicrophonePermission(granted = true)
            MicrophonePermissionAction.NOTIFY_DENIED,
            MicrophonePermissionAction.IGNORE,
            -> Unit
        }
    }

    private fun notifyMicrophonePermission(granted: Boolean) {
        val currentWebView = webView ?: return
        currentWebView.post {
            currentWebView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('opict-microphone-permission', { detail: { granted: $granted } }));",
                null,
            )
        }
    }

    private inner class ShellChromeClient : WebChromeClient() {
        override fun onProgressChanged(view: WebView, newProgress: Int) {
            progress.progress = newProgress
            progress.visibility = if (newProgress in 0..99) View.VISIBLE else View.GONE
        }

        override fun onPermissionRequest(request: PermissionRequest) {
            runOnUiThread { handleWebViewPermissionRequest(request) }
        }

        override fun onPermissionRequestCanceled(request: PermissionRequest) {
            if (pendingAudioPermissionRequest === request) {
                pendingAudioPermissionRequest = null
            }
        }

        private fun handleWebViewPermissionRequest(request: PermissionRequest) {
            if (!WebViewPermissionPolicy.canGrantAudioCapture(request.origin, request.resources)) {
                request.deny()
                return
            }

            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                return
            }

            pendingAudioPermissionRequest?.deny()
            pendingAudioPermissionRequest = request
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), AUDIO_PERMISSION_REQUEST_CODE)
        }

        override fun onCreateWindow(
            view: WebView,
            isDialog: Boolean,
            isUserGesture: Boolean,
            resultMsg: Message,
        ): Boolean {
            if (!isUserGesture) return false
            val popup = WebView(this@MainActivity)
            popup.webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    popupView: WebView,
                    request: WebResourceRequest,
                ): Boolean {
                    handleNavigation(request.url, view, true)
                    popupView.destroy()
                    return true
                }
            }
            (resultMsg.obj as WebView.WebViewTransport).webView = popup
            resultMsg.sendToTarget()
            return true
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == NATIVE_AUDIO_PERMISSION_REQUEST_CODE) {
            when (microphonePermissionFlow.finish(grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED)) {
                MicrophonePermissionAction.NOTIFY_GRANTED -> notifyMicrophonePermission(granted = true)
                MicrophonePermissionAction.NOTIFY_DENIED -> notifyMicrophonePermission(granted = false)
                MicrophonePermissionAction.REQUEST,
                MicrophonePermissionAction.IGNORE,
                -> Unit
            }
            return
        }
        if (requestCode != AUDIO_PERMISSION_REQUEST_CODE) return

        val request = pendingAudioPermissionRequest
        pendingAudioPermissionRequest = null
        if (
            request != null &&
            grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED &&
            WebViewPermissionPolicy.canGrantAudioCapture(request.origin, request.resources)
        ) {
            request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
        } else {
            request?.deny()
        }
    }

    private fun handleNavigation(uri: Uri, target: WebView, forceInternalLoad: Boolean): Boolean {
        return when (NavigationPolicy.classify(uri)) {
            NavigationDestination.INTERNAL -> {
                if (forceInternalLoad) target.loadUrl(uri.toString())
                forceInternalLoad
            }
            NavigationDestination.EXTERNAL -> {
                openExternal(uri)
                true
            }
            NavigationDestination.BLOCKED -> {
                Toast.makeText(this, R.string.blocked_url, Toast.LENGTH_SHORT).show()
                true
            }
        }
    }

    private fun openExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, R.string.no_external_app, Toast.LENGTH_SHORT).show()
        } catch (_: SecurityException) {
            Toast.makeText(this, R.string.no_external_app, Toast.LENGTH_SHORT).show()
        }
    }

    private fun showError(url: String?, messageRes: Int) {
        navigationFailed = true
        failedUrl = url?.takeIf { NavigationPolicy.classify(Uri.parse(it)) == NavigationDestination.INTERNAL }
            ?: START_URL
        progress.visibility = View.GONE
        errorMessage.setText(messageRes)
        errorOverlay.visibility = View.VISIBLE
    }

    private fun retry() {
        errorOverlay.visibility = View.GONE
        val current = webView
        if (current == null) {
            createWebView(null)
        } else {
            current.loadUrl(failedUrl)
        }
    }

    private fun disposeWebView(view: WebView) {
        if (webView === view) webView = null
        root.removeView(view)
        view.stopLoading()
        view.webChromeClient = null
        view.webViewClient = WebViewClient()
        view.destroy()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView?.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        microphonePermissionFlow.cancel()
        pendingAudioPermissionRequest?.deny()
        pendingAudioPermissionRequest = null
        webView?.let(::disposeWebView)
        super.onDestroy()
    }

    private fun linearParams(top: Int): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(top)
        }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    companion object {
        const val START_URL = "https://opict.mygreed.shop/"
        private const val AUDIO_PERMISSION_REQUEST_CODE = 4101
        private const val NATIVE_AUDIO_PERMISSION_REQUEST_CODE = 4102
    }
}

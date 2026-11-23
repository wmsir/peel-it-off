package com.peelitoff.app

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var lastBackPressMs: Long = 0L

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 与游戏纸板暖色背景一致的状态栏/导航栏配色（浅色底 + 深色图标）
        val bgHex = Color.parseColor("#FFFAF0")
        window.statusBarColor = bgHex
        window.navigationBarColor = bgHex
        val insetsController = WindowInsetsControllerCompat(window, window.decorView)
        insetsController.isAppearanceLightStatusBars = true
        insetsController.isAppearanceLightNavigationBars = true

        // 使用 AndroidX WebViewAssetLoader 提供安全 HTTPS 源，彻底避免 file:// 下的 WebAudio/CORS 限制
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(bgHex)
            overScrollMode = WebView.OVER_SCROLL_NEVER
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                mediaPlaybackRequiresUserGesture = false
                allowFileAccess = false
                allowContentAccess = false
                useWideViewPort = true
                loadWithOverviewMode = true
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                cacheMode = WebSettings.LOAD_DEFAULT
            }

            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ): WebResourceResponse? {
                    return assetLoader.shouldInterceptRequest(request.url)
                }
            }

            addJavascriptInterface(AndroidBridge(), "AndroidBridge")
        }

        setContentView(webView)
        webView.loadUrl("https://appassets.androidplatform.net/assets/www/index.html")

        // 防误触：2 秒内连按两次返回键才退出
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val now = System.currentTimeMillis()
                if (now - lastBackPressMs < 2000L) {
                    finish()
                } else {
                    lastBackPressMs = now
                    Toast.makeText(
                        this@MainActivity,
                        "再按一次退出《捏个痛快！》",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
        })
    }

    private fun getVibrator(): Vibrator? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val manager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            manager?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
    }

    inner class AndroidBridge {

        /** 原生线性马达震动：接收形如 "10,22,10,20,14" 的毫秒序列（奇数位为震动，偶数位为停顿） */
        @JavascriptInterface
        fun vibrate(patternCsv: String) {
            val vib = getVibrator() ?: return
            if (!vib.hasVibrator()) return
            val parts = patternCsv.split(",")
                .mapNotNull { it.trim().toLongOrNull() }
                .filter { it > 0L }
            if (parts.isEmpty()) return

            try {
                if (parts.size == 1) {
                    vib.vibrate(
                        VibrationEffect.createOneShot(
                            parts[0].coerceIn(1L, 300L),
                            VibrationEffect.DEFAULT_AMPLITUDE
                        )
                    )
                } else {
                    // Android createWaveform 第 0 位为初始延迟，前置 0L 对齐 Web navigator.vibrate 语义
                    val timings = LongArray(parts.size + 1)
                    timings[0] = 0L
                    for (i in parts.indices) {
                        timings[i + 1] = parts[i].coerceIn(1L, 300L)
                    }
                    vib.vibrate(VibrationEffect.createWaveform(timings, -1))
                }
            } catch (_: Exception) {
                // 忽略个别定制 ROM 震动权限异常
            }
        }

        /** 原生系统分享面板 */
        @JavascriptInterface
        fun shareText(text: String) {
            runOnUiThread {
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_SUBJECT, "捏个痛快！超解压捏泡泡纸游戏")
                    putExtra(Intent.EXTRA_TEXT, text)
                }
                startActivity(Intent.createChooser(intent, "分享战绩给好友"))
            }
        }

        /**
         * 激励视频广告接入点（Google AdMob / 穿山甲 CSJ / 优量汇 GDT）：
         * 接入真实 SDK 后将返回值改为 true，并在 showRewardedAd 中拉起激励视频，
         * 观看完成回调时执行 window.__onNativeRewardedAdResult(true) 即可发放奖励。
         */
        @JavascriptInterface
        fun hasNativeRewardedAd(): Boolean = false

        @JavascriptInterface
        fun showRewardedAd(rewardTitle: String) {
            runOnUiThread {
                // TODO: 在此处接入 AdMob RewardedAd / 穿山甲 TTRewardVideoAd
                webView.evaluateJavascript(
                    "window.__onNativeRewardedAdResult && window.__onNativeRewardedAdResult(true);",
                    null
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}

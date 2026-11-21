# 保留 WebView JavascriptInterface 桥接类与方法，防止 R8 混淆裁剪
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.peelitoff.app.MainActivity$AndroidBridge { *; }

package io.github.asafetork.farol;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** Offline shell for the Farol practice page. No external page can use its bridge. */
public final class MainActivity extends Activity {
    private static final String ORIGIN_HOST = "appassets.androidplatform.net";
    private static final String PREFIX = "/assets/";
    private static final String START = "https://" + ORIGIN_HOST + PREFIX + "pratica.html";
    private static final Set<String> ALLOWED = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            "index.html", "farol-sessao-viva.html", "pratica.html", "android-tts.js",
            "assets/farol.css", "assets/farol.js", "assets/farol-icon.svg",
            "assets/pratica.css", "assets/pratica.mjs", "src/core/privacy.mjs",
            "src/core/planner.mjs", "src/ui/assistant.mjs", "src/ui/styles.mjs"
    )));
    private static final String POLICY = "default-src 'self'; script-src 'self' 'unsafe-inline'; "
            + "style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; "
            + "connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'";

    private WebView webView;
    private TextToSpeech speech;
    private volatile boolean localVoiceReady;
    private volatile boolean destroyed;

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(4, 24, 63));
        getWindow().setNavigationBarColor(Color.rgb(4, 24, 63));

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true); // only the static allowlisted app assets are ever loaded
        settings.setDomStorageEnabled(true); // preferences and structural cache only
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSaveFormData(false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        webView.setWebViewClient(new OfflineClient());
        // The bridge never coexists with remote content: every navigation and
        // resource is restricted to the allowlist, and INTERNET is not granted.
        webView.addJavascriptInterface(new LocalVoiceBridge(), "FarolAndroidVoice");
        webView.setFitsSystemWindows(true);
        webView.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        setContentView(webView);
        webView.requestApplyInsets();
        initializeLocalVoice();
        // Intents, extras and external URLs are deliberately ignored.
        webView.loadUrl(START);
    }

    private boolean isAllowed(Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())
                || !ORIGIN_HOST.equalsIgnoreCase(uri.getHost()) || uri.getPort() != -1
                || uri.getUserInfo() != null) return false;
        String path = uri.getPath();
        return path != null && path.startsWith(PREFIX) && ALLOWED.contains(path.substring(PREFIX.length()));
    }

    private static String mimeType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js") || path.endsWith(".mjs")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    private WebResourceResponse denied(int code, String reason) {
        return new WebResourceResponse("text/plain", "utf-8", code, reason,
                Collections.singletonMap("Cache-Control", "no-store"),
                new ByteArrayInputStream(new byte[0]));
    }

    private final class OfflineClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            // Do not open external apps, http(s) pages, custom schemes or portals.
            return !isAllowed(request.getUrl());
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!"GET".equals(request.getMethod()) || !isAllowed(uri)) return denied(403, "Forbidden");
            String path = uri.getPath().substring(PREFIX.length());
            try {
                InputStream input = getAssets().open("www/" + path);
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-store");
                headers.put("X-Content-Type-Options", "nosniff");
                headers.put("Content-Security-Policy", POLICY);
                return new WebResourceResponse(mimeType(path), "utf-8", 200, "OK", headers, input);
            } catch (IOException error) {
                return denied(404, "Not Found");
            }
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            handler.cancel();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame() && !destroyed) {
                Toast.makeText(MainActivity.this, R.string.load_error, Toast.LENGTH_LONG).show();
            }
        }
    }

    private void initializeLocalVoice() {
        speech = new TextToSpeech(this, status -> runOnUiThread(() -> configureLocalVoice(status)));
    }

    private void configureLocalVoice(int status) {
        if (destroyed || status != TextToSpeech.SUCCESS || speech == null) return;
        Voice selected = null;
        try {
            Set<Voice> voices = speech.getVoices();
            if (voices != null) {
                for (Voice voice : voices) {
                    if (voice.getLocale() == null || voice.isNetworkConnectionRequired()) continue;
                    if (!"pt".equalsIgnoreCase(voice.getLocale().getLanguage())
                            || !"BR".equalsIgnoreCase(voice.getLocale().getCountry())) continue;
                    if (selected == null || voice.getQuality() > selected.getQuality()) selected = voice;
                }
            }
            localVoiceReady = selected != null && speech.setVoice(selected) == TextToSpeech.SUCCESS;
        } catch (RuntimeException ignored) {
            localVoiceReady = false;
        }
        if (webView != null && !destroyed) webView.post(() -> {
            if (!destroyed) webView.evaluateJavascript(
                    "if(window.farolAndroidVoiceChanged)window.farolAndroidVoiceChanged()", null);
        });
    }

    private final class LocalVoiceBridge {
        @JavascriptInterface
        public boolean isReady() { return localVoiceReady && !destroyed; }

        @JavascriptInterface
        public void speak(String instruction, double rate) {
            // The bridge is available only to packaged assets. Bound text so a
            // broken local page cannot enqueue an unbounded synthesis request.
            if (!localVoiceReady || destroyed || instruction == null || instruction.length() > 2000
                    || !Double.isFinite(rate)) return;
            float safeRate = (float) Math.max(0.7, Math.min(1.1, rate));
            runOnUiThread(() -> {
                if (destroyed || !localVoiceReady || speech == null) return;
                speech.setSpeechRate(safeRate);
                speech.speak(instruction, TextToSpeech.QUEUE_FLUSH, null, "farol-instruction");
            });
        }

        @JavascriptInterface
        public void stop() {
            runOnUiThread(() -> { if (!destroyed && speech != null) speech.stop(); });
        }
    }

    @Override
    protected void onPause() {
        if (speech != null) speech.stop();
        super.onPause();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        destroyed = true;
        localVoiceReady = false;
        if (speech != null) { speech.stop(); speech.shutdown(); speech = null; }
        if (webView != null) {
            webView.removeJavascriptInterface("FarolAndroidVoice");
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}

package com.ifpa.iassistente.assistant

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.service.voice.VoiceInteractionSession
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/**
 * Equivalente funcional ao "Ok Google" sem permissão de sistema: escuta
 * CONTÍNUA opt-in, com notificação persistente visível, reconhece a frase
 * "Farol me ajude" e abre a sessão do assistente. O hotword real do Android
 * (HotwordDetector) é SystemApi e exige MANAGE_HOTWORD_DETECTION/signature.
 */
class WakeWordService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var paused = false

    private fun notification(): Notification {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            if (nm.getNotificationChannel(CHANNEL) == null)
                nm.createNotificationChannel(NotificationChannel(CHANNEL, "Farol — chamada por voz",
                    NotificationManager.IMPORTANCE_LOW).apply { description = "Microfone ativo para 'Farol me ajude'" })
        }
        val open = PendingIntent.getActivity(this, 1, Intent(this, com.ifpa.iassistente.MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL)
        else @Suppress("DEPRECATION") Notification.Builder(this)
        return builder.setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("Farol ouvindo")
            .setContentText("Diga “Farol me ajude” · toque para abrir o app")
            .setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true).build()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(77, notification())
        listen()
        return START_STICKY
    }

    private fun listen() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            stopSelf(); return
        }
        try {
            recognizer?.destroy()
            recognizer = FarolSpeech.create(this)
            recognizer?.setRecognitionListener(object : SpeechListener() {
                private fun check(text: String) {
                    val t = text.lowercase()
                    if (t.contains("farol") && t.contains("ajude")) {
                        paused = true
                        FarolVoiceService.active?.showSession(Bundle().apply { putBoolean("listen", true) },
                            VoiceInteractionSession.SHOW_WITH_ASSIST)
                        handler.postDelayed({ paused = false; listen() }, 9000)
                    }
                }
                override fun onPartialResults(partial: Bundle?) {
                    partial?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let(::check)
                }
                override fun onResults(results: Bundle?) {
                    results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let(::check)
                    restart()
                }
                override fun onError(error: Int) { restart() }
                override fun onEndOfSpeech() { restart() }
            })
            recognizer?.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR")
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            })
        } catch (_: Exception) { restart() }
    }

    private fun restart() {
        if (!paused) handler.postDelayed({ listen() }, 600)
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        recognizer?.cancel(); recognizer?.destroy(); recognizer = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val CHANNEL = "farol-wake"
        fun enabled(context: Context) = context.getSharedPreferences("farol", Context.MODE_PRIVATE)
            .getBoolean("wake_enabled", false)
    }
}

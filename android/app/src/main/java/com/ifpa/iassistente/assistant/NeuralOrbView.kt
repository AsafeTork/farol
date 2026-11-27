package com.ifpa.iassistente.assistant

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.view.MotionEvent
import android.view.View
import kotlin.math.cos
import kotlin.math.abs
import kotlin.math.min
import kotlin.math.sin

/**
 * Orb "neural" do Farol: núcleo noite sob vidro, aura âmbar, pontos orbitais e
 * respiracão ligada à voz. Arrastável para qualquer canto; soltar na zona
 * inferior de "desligar" fecha a sessão. Tátilite x gov.br: 60/30/10,
 * acento #FFCD07 só no elemento de ação, motion <=300ms e interrompível.
 */
class NeuralOrbView(context: Context, private val onClose: () -> Unit) : View(context) {
    var speechLevel = 0f          // 0..1, alimentado pelo reconhecedor
    var speaking = false
    private var phase = 0f
    private var dragging = false
    private var startX = 0f
    private var startY = 0f
    private var originX = 0f
    private var originY = 0f
    private var radius = 0f
    private val core = Paint(Paint.ANTI_ALIAS_FLAG)
    private val halo = Paint(Paint.ANTI_ALIAS_FLAG)
    private val dot = Paint(Paint.ANTI_ALIAS_FLAG)
    private val zone = Paint(Paint.ANTI_ALIAS_FLAG)
    private val label = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFEAF0FA.toInt(); textAlign = Paint.Align.CENTER; textSize = 15f
    }
    private var closeZone = RectF()

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
        contentDescription = "Farol: arraste para um canto; solte em desligar para encerrar"
        isClickable = true
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        radius = min(w, h) * 0.23f
        halo.color = 0xFFFFB020.toInt()
        halo.style = Paint.Style.FILL
        core.color = 0xFF04183F.toInt()
        dot.color = 0xFFFFCD07.toInt()
        zone.color = 0x26FFCD07
        zone.style = Paint.Style.STROKE
        zone.strokeWidth = 2f
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val cx = width / 2f
        val cy = height / 2f
        val breath = 1f + .05f * sin(phase)
        val talk = if (speaking) .16f * speechLevel.coerceIn(0f, 1f) else 0f
        val r = radius * (breath + talk)

        // aura: três anéis translúcidos (dither de cor, sem shader nativo)
        for (i in 3 downTo 1) {
            halo.alpha = 34 + (3 - i) * 26
            canvas.drawCircle(cx, cy, r * (1f + i * .16f), halo)
        }
        halo.alpha = 255
        core.color = 0xFF155BCB.toInt()
        canvas.drawCircle(cx, cy, r, core)
        core.color = 0xFF04183F.toInt()
        canvas.drawCircle(cx, cy, r * .82f, core)
        // anel de vidro fosco
        core.shader = null
        core.style = Paint.Style.STROKE
        core.color = 0x55FFFFFF
        core.strokeWidth = 1.5f
        canvas.drawCircle(cx, cy, r, core)
        core.style = Paint.Style.FILL
        // pontos orbitais — "neural": pequenos, desiguais, sem simetria rígida
        for (i in 0 until 7) {
            val a = phase * (if (i % 2 == 0) .7f else -.5f) + i * (Math.PI * 2 / 7).toFloat()
            val rr = r * (1.12f + .12f * sin(phase * 1.3f + i))
            dot.alpha = (110 + 100 * (1f + sin(phase + i)) / 2f).toInt()
            canvas.drawCircle(cx + cos(a) * rr, cy + sin(a) * rr, (2.2f + (i % 3)), dot)
        }
        dot.alpha = 255
        // linhas de voz: só quando falando (evento real, não tempero)
        if (speaking) for (i in -2..2) {
            val h = r * (.14f + .5f * abs(sin(phase * 2f + i)) * speechLevel)
            canvas.drawRect(cx + i * r * .18f - 1.5f, cy - h, cx + i * r * .18f + 1.5f, cy + h, dot)
        }
        if (dragging) {
            val w = resources.displayMetrics.widthPixels
            closeZone.set(w * .30f, resources.displayMetrics.heightPixels - 150f, w * .70f, resources.displayMetrics.heightPixels - 60f)
            canvas.drawRoundRect(closeZone, 16f, 16f, zone)
            canvas.drawText("Solte para desligar", closeZone.centerX(), closeZone.centerY() + 5f, label)
        }
        phase += .035f
        invalidate()
    }

    override fun onTouchEvent(e: MotionEvent): Boolean = when (e.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
            dragging = true; startX = e.rawX; startY = e.rawY
            originX = x; originY = y; parent.requestDisallowInterceptTouchEvent(true)
            invalidate(); true
        }
        MotionEvent.ACTION_MOVE -> {
            x = originX + (e.rawX - startX); y = originY + (e.rawY - startY)
            invalidate(); true
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
            dragging = false
            val mx = x + width / 2f; val my = y + height / 2f
            val inClose = mx in closeZone.left..closeZone.right && my in closeZone.top..closeZone.bottom
            if (inClose) { onClose() }
            else {
                val w = resources.displayMetrics.widthPixels
                val h = resources.displayMetrics.heightPixels
                val pad = 16f * resources.displayMetrics.density
                animate().x(if (mx < w / 2f) pad else w - width - pad)
                    .y(if (my < h / 2f) pad else h - height - pad).setDuration(240).start()
            }
            invalidate(); true
        }
        else -> false
    }
}

/** Brilho temporário nas bordas da tela ao despertar — some sozinho em ~1,6s. */
class EdgeGlowView(context: Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private var alpha = 0f
    init { importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO; isClickable = false }
    fun startGlow() {
        ValueAnimator.ofFloat(1f, 0f).apply {
            duration = 1600
            addUpdateListener { alpha = it.animatedValue as Float; invalidate() }
            start()
        }
    }
    override fun onDraw(canvas: Canvas) {
        if (alpha <= 0f) return
        val span = 90f * resources.displayMetrics.density
        paint.alpha = (alpha * 120).toInt()
        paint.shader = LinearGradient(0f, 0f, 0f, span, intArrayOf(0x55FFCD07, 0x00FFCD07), floatArrayOf(0f, 1f), Shader.TileMode.CLAMP)
        canvas.drawRect(0f, 0f, width.toFloat(), span, paint)
        paint.shader = LinearGradient(0f, height.toFloat(), 0f, height - span, intArrayOf(0x55FFB020, 0x00FFB020), floatArrayOf(0f, 1f), Shader.TileMode.CLAMP)
        canvas.drawRect(0f, height - span, width.toFloat(), height.toFloat(), paint)
        paint.shader = null
    }
}

package com.ifpa.iassistente.assistant

import android.Manifest
import android.app.assist.AssistContent
import android.app.assist.AssistStructure
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.*
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.service.voice.VoiceInteractionSession
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.text.InputFilter
import android.view.*
import android.widget.*
import com.ifpa.iassistente.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Locale
import java.util.concurrent.Executors

class FarolSession(private val ctx: Context) : VoiceInteractionSession(ctx) {
    private val prefs=ctx.getSharedPreferences("farol",Context.MODE_PRIVATE)
    private val ui=Handler(Looper.getMainLooper())
    private val worker=Executors.newSingleThreadExecutor()
    private var structure: AssistStructure?=null
    private var active=false
    private var generation=0
    private var tts: TextToSpeech?=null
    private var voiceReady=false
    private var recognizer: SpeechRecognizer?=null
    private var lastSpoken=""
    private var startVoiceOnShow=false
    private lateinit var root: FrameLayout
    private lateinit var panel: ScrollView
    private lateinit var card: LinearLayout
    private lateinit var state: TextView
    private lateinit var message: TextView
    private lateinit var transcript: TextView
    private lateinit var question: EditText
    private lateinit var consentBox: LinearLayout
    private lateinit var explain: Button
    private lateinit var highlight: HighlightView
    private lateinit var orb: NeuralOrbView
    private lateinit var edge: EdgeGlowView
    private val navy=Color.rgb(4,24,63)
    private val blue=Color.rgb(19,81,180)
    private val yellow=Color.rgb(255,205,7)
    private val font by lazy { try { Typeface.createFromAsset(ctx.assets,"fonts/AtkinsonHyperlegible-Regular.ttf") }catch(_:Exception){Typeface.DEFAULT} }
    private fun dp(n: Int)=(n*ctx.resources.displayMetrics.density+.5f).toInt()
    private fun bg(color: Int)=GradientDrawable().apply { setColor(color);cornerRadius=dp(16).toFloat() }
    private fun text(value: String,size: Float=18f,color: Int=Color.WHITE)=TextView(ctx).apply {
        text=value;textSize=size;typeface=font;setTextColor(color);setLineSpacing(0f,1.2f)
    }
    private fun button(value: String,id: Int,action:()->Unit)=Button(ctx).apply {
        text=value;this.id=id;textSize=18f;typeface=font;isAllCaps=false;minimumHeight=dp(56)
        setPadding(dp(12),dp(8),dp(12),dp(8));setTextColor(blue);background=bg(Color.WHITE)
        setOnClickListener { action() }
    }
    override fun onCreate() {
        super.onCreate()
        setDisabledShowContext(SHOW_WITH_SCREENSHOT)
        window?.window?.addFlags(WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN)
        window?.window?.setDimAmount(0f)
        tts=TextToSpeech(ctx) { status ->
            if(status==TextToSpeech.SUCCESS) {
                val ready=tts?.setLanguage(Locale.forLanguageTag("pt-BR"))
                voiceReady=ready!=TextToSpeech.LANG_MISSING_DATA && ready!=TextToSpeech.LANG_NOT_SUPPORTED
                // Voz feminina pt-BR quando o mecanismo a oferece; nome é a única
                // pista de gênero que a API pública do Android expõe.
                tts?.voices?.let { vs ->
                    val pt=vs.filter { it.locale.language.equals("pt",true) }
                    val feminina=pt.firstOrNull { Regex("femin|female|mulher|women",RegexOption.IGNORE_CASE).containsMatchIn(it.name) }
                    val escolhida=feminina ?: pt.firstOrNull { it.name.contains("Google",true) } ?: pt.firstOrNull()
                    if(escolhida!=null) tts?.setVoice(escolhida)
                }
                tts?.setOnUtteranceProgressListener(object:UtteranceProgressListener() {
                    override fun onStart(id: String?) { ui.post { if(active && ::state.isInitialized)state.text="O Farol está lendo"; if(::orb.isInitialized)orb.speaking=true } }
                    override fun onDone(id: String?) { ui.post { if(active && ::state.isInitialized)state.text="Você no comando"; if(::orb.isInitialized){orb.speaking=false;orb.speechLevel=0f} } }
                    @Deprecated("Legacy callback") override fun onError(id: String?) { ui.post { if(active && ::state.isInitialized)state.text="A orientação está em texto"; if(::orb.isInitialized)orb.speaking=false } }
                })
            }
        }
    }
    override fun onCreateContentView(): View {
        root=FrameLayout(ctx).apply { setBackgroundColor(Color.TRANSPARENT) }
        edge=EdgeGlowView(ctx);root.addView(edge,FrameLayout.LayoutParams(-1,-1))
        highlight=HighlightView(ctx);root.addView(highlight,FrameLayout.LayoutParams(-1,-1))
        panel=ScrollView(ctx).apply { id=R.id.assistant_panel;isFillViewport=false;background=bg(navy) }
        card=LinearLayout(ctx).apply { orientation=LinearLayout.VERTICAL;setPadding(dp(16),dp(16),dp(16),dp(16)) }
        panel.addView(card)
        val header=LinearLayout(ctx).apply { gravity=Gravity.CENTER_VERTICAL }
        header.addView(text("● Farol",24f,yellow),LinearLayout.LayoutParams(0,-2,1f))
        header.addView(button("Fechar",R.id.assistant_close){finish()},LinearLayout.LayoutParams(-2,dp(56)))
        card.addView(header)
        state=text("Você no comando",16f,yellow).apply { id=R.id.assistant_state }
        card.addView(state,LinearLayout.LayoutParams(-1,-2).apply { topMargin=dp(8);bottomMargin=dp(8) })
        message=text("Pergunte ou peça uma explicação dos controles desta tela.").apply {
            id=R.id.assistant_message;accessibilityLiveRegion=View.ACCESSIBILITY_LIVE_REGION_POLITE
        }
        card.addView(message,LinearLayout.LayoutParams(-1,-2).apply { bottomMargin=dp(8) })
        transcript=text("").apply { id=R.id.assistant_transcript;textSize=14f;setTextColor(Color.rgb(85,112,143));maxLines=4 }
        card.addView(transcript,LinearLayout.LayoutParams(-1,-2).apply { bottomMargin=dp(8) })
        consentBox=LinearLayout(ctx).apply { orientation=LinearLayout.VERTICAL;id=R.id.assistant_consent }
        consentBox.addView(text("Para usar a IA, o Farol envia sua pergunta e rótulos de controles à OpenAI. Valores preenchidos no outro app, senhas e imagens da tela ficam fora do envio."))
        consentBox.addView(button("Autorizar e explicar",R.id.assistant_allow_cloud) {
            prefs.edit().putBoolean("consent",true).putBoolean("ai_consent",true).apply()
            updateAvailability();ask()
        },LinearLayout.LayoutParams(-1,-2).apply { topMargin=dp(8);bottomMargin=dp(16) })
        card.addView(consentBox)
        question=EditText(ctx).apply {
            id=R.id.assistant_question;hint="Como posso ajudar?";textSize=18f;typeface=font
            setTextColor(navy);setHintTextColor(Color.rgb(85,85,85));background=bg(Color.WHITE)
            setPadding(dp(16),dp(8),dp(16),dp(8));minimumHeight=dp(56);maxLines=3
            filters=arrayOf(InputFilter.LengthFilter(400));isSaveEnabled=false
            importantForAutofill=View.IMPORTANT_FOR_AUTOFILL_NO
        }
        card.addView(question,LinearLayout.LayoutParams(-1,-2).apply { bottomMargin=dp(8) })
        fun row(vararg buttons:Button) {
            val r=LinearLayout(ctx)
            buttons.forEachIndexed { i,b->r.addView(b,LinearLayout.LayoutParams(0,-2,1f).apply { if(i>0)marginStart=dp(8) }) }
            card.addView(r,LinearLayout.LayoutParams(-1,-2).apply { topMargin=dp(8) })
        }
        explain=button("Explicar com IA",R.id.assistant_explain){ask()}
        row(explain,button("Falar",R.id.assistant_speak){listen()})
        row(button("Repetir voz",R.id.assistant_repeat){speak(lastSpoken)},button("Guia local",R.id.assistant_local){localGuide()})
        val height=(ctx.resources.configuration.screenHeightDp*.58f).toInt().coerceIn(200,440)
        root.addView(panel,FrameLayout.LayoutParams(-1,dp(height),Gravity.BOTTOM).apply {
            leftMargin=dp(16);rightMargin=dp(16);bottomMargin=dp(40);topMargin=dp(40)
        })
        orb=NeuralOrbView(ctx){ hide() }.apply { id=R.id.assistant_orb;alpha=.94f }
        root.addView(orb,FrameLayout.LayoutParams(dp(104),dp(104),Gravity.TOP or Gravity.END).apply {
            topMargin=dp(72);rightMargin=dp(16)
        })
        updateAvailability()
        return root
    }
    private fun updateAvailability() {
        if(!::consentBox.isInitialized)return
        val consent=prefs.getBoolean("ai_consent",false)
        consentBox.visibility=if(consent)View.GONE else View.VISIBLE
        explain.isEnabled=consent && AiClient.configured(ctx)
        explain.alpha=if(explain.isEnabled)1f else .55f
        if(!AiClient.configured(ctx))state.text="IA em preparação · guia local disponível"
        else if(!consent)state.text="Sua autorização vem primeiro"
        else state.text="Pronto para consultar a IA"
    }
    override fun onShow(args: Bundle?,flags: Int) {
        super.onShow(args,flags);active=true;generation++;structure=null
        if(::edge.isInitialized)edge.startGlow()
        if(::orb.isInitialized){orb.speaking=false;orb.speechLevel=0f}
        if(::highlight.isInitialized)highlight.target=null
        updateAvailability()
        startVoiceOnShow=args?.getBoolean("listen")==true
        if(startVoiceOnShow)ui.postDelayed({ if(active)listen() },700)
    }
    @Deprecated("Compatible with Android 8 and later")
    override fun onHandleAssist(data: Bundle?,structure: AssistStructure?,content: AssistContent?) {
        this.structure=structure
        if(::message.isInitialized && active && (structure==null || structure.windowNodeCount==0))
            message.text="Esta tela não compartilhou controles. Diga qual ajuda você precisa."
    }
    private fun snapshot()=AssistCapture.capture(structure)
    private fun recordSnapshot(payload: JSONObject) {
        if(BuildConfig.DEBUG)File(ctx.filesDir,"last-assist-snapshot.json").writeText(payload.toString(2))
    }
    private fun localGuide() {
        prefs.edit().putBoolean("consent",true).apply()
        val snap=snapshot();recordSnapshot(snap.envelope("").put("consent","local"))
        val nodes=(0 until snap.nodes.length()).map { i -> snap.nodes.getJSONObject(i).let { Target(it.getInt("id"),it.getString("role"),it.getString("label"),it.getBoolean("filled")) } }
        val advice=LocalPlanner.plan(nodes,null)
        state.text="Guia local · sem consulta à IA";message.text=advice.text
        mark(advice.target?.let { snap.bounds[it] });speak(advice.text)
    }
    private fun history(): JSONArray = try { JSONArray(prefs.getString("assistant_history","[]")?:"[]") } catch(_:Exception) { JSONArray() }
    private fun remember(question: String, answer: String) {
        val h=history()
        if(question.isNotBlank())h.put(JSONObject().put("role","user").put("text",Privacy.clean(question,240)))
        h.put(JSONObject().put("role","farol").put("text",Privacy.clean(answer,240)))
        while(h.length()>8)h.remove(0)
        prefs.edit().putString("assistant_history",h.toString()).apply()
    }
    private fun ask() {
        if(!active)return
        if(!prefs.getBoolean("ai_consent",false)) { updateAvailability();message.text="Autorize o envio antes de consultar a IA.";return }
        if(!AiClient.configured(ctx)) { message.text="A IA ainda não está conectada. Você pode usar o guia local.";return }
        val snap=snapshot();val prompt=Privacy.clean(question.text.toString(),400)
        if(snap.nodes.length()==0 && prompt.isBlank()) { message.text="Esta tela não compartilhou controles. Escreva seu objetivo para eu ajudar.";return }
        val payload=snap.envelope(prompt)
        val h=history();if(h.length()>0)payload.put("history",h)
        recordSnapshot(payload)
        val request=++generation
        tts?.stop();recognizer?.cancel();state.text="Consultando a IA";message.text="Vou explicar um passo de cada vez."
        if(prompt.isNotBlank())transcript.text=(transcript.text.toString()+"\nVocê: "+prompt).trim().lines().takeLast(4).joinToString("\n");explain.isEnabled=false
        worker.execute {
            try {
                val result=AiClient.ask(ctx,payload)
                ui.post {
                    if(!active || request!=generation)return@post
                    explain.isEnabled=true;state.text="Orientação da OpenAI";message.text=result.instruction
                    remember(prompt,result.instruction)
                    transcript.text=(transcript.text.toString()+"\nFarol: "+result.instruction).trim().lines().takeLast(4).joinToString("\n")
                    mark(result.target?.let { snap.bounds[it] });speak(result.instruction)
                    if(BuildConfig.DEBUG)File(ctx.filesDir,"last-ai-result.json").writeText(JSONObject().put("provider",result.provider).put("model",result.model).put("request_id",result.requestId).put("instruction",result.instruction).put("target_id",result.target ?: JSONObject.NULL).toString())
                }
            }catch(error:Exception) {
                ui.post {
                    if(!active || request!=generation)return@post
                    explain.isEnabled=true;state.text="IA indisponível agora"
                    message.text=when((error as? AiUnavailable)?.code) {
                        "test_budget_reached"->"O limite de consultas deste teste foi alcançado. O guia local continua disponível."
                        "openai_not_configured","not_configured"->"A conexão com a OpenAI ainda precisa ser concluída. O guia local está disponível."
                        "not_a_real_provider"->"O serviço não confirmou uma resposta real da OpenAI. A orientação não será apresentada como IA."
                        else->"Não consegui consultar a IA. Tente novamente ou use o guia local."
                    }
                }
            }
        }
    }
    private fun mark(rect:RectF?) {
        highlight.target=rect
        if(rect!=null && ::panel.isInitialized) {
            val p=panel.layoutParams as FrameLayout.LayoutParams
            p.gravity=if(rect.centerY()>ctx.resources.displayMetrics.heightPixels*.58f)Gravity.TOP else Gravity.BOTTOM
            panel.layoutParams=p
        }
    }
    private fun speak(value: String) {
        lastSpoken=value
        if(value.isBlank() || !voiceReady || !prefs.getBoolean("voice",true))return
        tts?.setSpeechRate(prefs.getFloat("speed",1f))
        tts?.speak(value,TextToSpeech.QUEUE_FLUSH,null,"farol-overlay")
    }
    private fun listen() {
        if(!prefs.getBoolean("ai_consent",false)) { message.text="Autorize a IA antes de fazer uma pergunta por voz.";return }
        if(!AiClient.configured(ctx)) { message.text="A IA ainda está em preparação. O guia local está disponível.";return }
        if(ctx.checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED) {
            startAssistantActivity(Intent(ctx,VoicePermissionActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));return
        }
        try {
            tts?.stop();recognizer?.destroy();recognizer=FarolSpeech.create(ctx)
            recognizer?.setRecognitionListener(object:SpeechListener() {
                override fun onReadyForSpeech(params:Bundle?) { if(active)state.text="Ouvindo você"; if(::orb.isInitialized)orb.speaking=true }
                override fun onRmsChanged(rmsdB: Float) { if(::orb.isInitialized)orb.speechLevel=((rmsdB+12f)/22f).coerceIn(0f,1f) }
                override fun onError(error:Int) { if(active){state.text="Microfone parado";message.text="Não consegui entender. Você pode escrever sua pergunta."}; if(::orb.isInitialized)orb.speaking=false }
                override fun onResults(results:Bundle?) {
                    if(!active)return
                    if(::orb.isInitialized){orb.speaking=false;orb.speechLevel=0f}
                    val heard=results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                    if(heard.isNotBlank()){question.setText(Privacy.clean(heard,400));ask()}
                }
            })
            state.text="Abrindo o microfone"
            recognizer?.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE,"pt-BR");putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE,true);putExtra(RecognizerIntent.EXTRA_MAX_RESULTS,1)
            })
        }catch(_:Exception){message.text="A voz não está disponível. Você pode escrever sua pergunta.";state.text="Microfone parado"}
    }
    override fun onComputeInsets(out: Insets) {
        super.onComputeInsets(out)
        if(!::panel.isInitialized)return
        val at=IntArray(2);panel.getLocationInWindow(at)
        out.contentInsets.set(0,root.height,0,0)
        out.touchableInsets=Insets.TOUCHABLE_INSETS_REGION
        out.touchableRegion.set(at[0],at[1],at[0]+panel.width,at[1]+panel.height)
        if(::orb.isInitialized) {
            val oa=IntArray(2);orb.getLocationOnScreen(oa)
            out.touchableRegion.union(Rect(oa[0],oa[1],oa[0]+orb.width,oa[1]+orb.height))
        }
    }
    override fun onCloseSystemDialogs() { hide() }
    override fun onHide() {
        active=false;generation++;structure=null;recognizer?.cancel();recognizer?.destroy();recognizer=null;tts?.stop()
        if(::highlight.isInitialized)highlight.target=null
        super.onHide()
    }
    override fun onDestroy() { active=false;generation++;worker.shutdownNow();recognizer?.destroy();tts?.shutdown();super.onDestroy() }
    private class HighlightView(context:Context):View(context) {
        var target:RectF?=null;set(value){field=value;invalidate()}
        private val paint=Paint(Paint.ANTI_ALIAS_FLAG).apply { style=Paint.Style.STROKE }
        init { importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO;isClickable=false;isFocusable=false }
        override fun onDraw(canvas:Canvas) {
            val rect=target?.let { RectF(it) } ?: return
            val at=IntArray(2);getLocationOnScreen(at);rect.offset(-at[0].toFloat(),-at[1].toFloat())
            val scale=resources.displayMetrics.density;rect.inset(-4*scale,-4*scale)
            paint.color=Color.rgb(4,24,63);paint.strokeWidth=5*scale;canvas.drawRoundRect(rect,8*scale,8*scale,paint)
            paint.color=Color.rgb(255,205,7);paint.strokeWidth=3*scale;canvas.drawRoundRect(rect,8*scale,8*scale,paint)
        }
    }
}

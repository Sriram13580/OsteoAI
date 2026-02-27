import { useState, useRef, useEffect, useCallback } from 'react'
import axios from 'axios'

const API_BASE = ''

// Language options with BCP-47 tags used by Web Speech API
const LANGUAGES = [
    { label: 'English (India)', flag: '🇮🇳', stt: 'en-IN', tts: 'en-IN' },
    { label: 'हिन्दी (Hindi)', flag: '🇮🇳', stt: 'hi-IN', tts: 'hi-IN' },
    { label: 'తెలుగు (Telugu)', flag: '🇮🇳', stt: 'te-IN', tts: 'te-IN' },
    { label: 'ಕನ್ನಡ (Kannada)', flag: '🇮🇳', stt: 'kn-IN', tts: 'kn-IN' },
    { label: 'മലയാളം (Malayalam)', flag: '🇮🇳', stt: 'ml-IN', tts: 'ml-IN' },
    { label: 'தமிழ் (Tamil)', flag: '🇮🇳', stt: 'ta-IN', tts: 'ta-IN' },
    { label: 'English (US)', flag: '🇺🇸', stt: 'en-US', tts: 'en-US' },
]

const QUICK_PROMPTS = [
    "What does my risk score mean?",
    "How can I improve my bone health?",
    "What foods help prevent osteoporosis?",
]

const SR = window.SpeechRecognition || window.webkitSpeechRecognition

export default function Chatbot({ analysisResult }) {
    const [open, setOpen] = useState(false)
    const [messages, setMessages] = useState([{
        role: 'bot',
        content: "👋 Hello! I'm **Dr. OsteoAI**, your AI bone health assistant. How can I help you today?"
    }])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [langIdx, setLangIdx] = useState(() => {
        const saved = localStorage.getItem('osteoai_lang')
        return saved !== null ? Number(saved) : 0
    })
    const [isListening, setIsListening] = useState(false)
    const [speakingIdx, setSpeakingIdx] = useState(null)
    const [ttsAuto, setTtsAuto] = useState(false)  // OFF by default — user must click 🔊
    const [ttsPaused, setTtsPaused] = useState(false)  // pause/resume state
    const [voices, setVoices] = useState([])

    const messagesEndRef = useRef(null)
    const recRef = useRef(null)

    const lang = LANGUAGES[langIdx]

    // ── Load voices (async — must use voiceschanged event) ────────────────────
    useEffect(() => {
        const load = () => setVoices(window.speechSynthesis.getVoices())
        load()  // try immediately (works if already cached)
        window.speechSynthesis.addEventListener('voiceschanged', load)
        return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
    }, [])

    // ── Auto-scroll messages ──────────────────────────────────────────────────
    useEffect(() => {
        if (open) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, open])

    // ── Stop everything on close ──────────────────────────────────────────────
    useEffect(() => {
        if (!open) {
            window.speechSynthesis.cancel()
            recRef.current?.stop()
            setIsListening(false)
            setSpeakingIdx(null)
        }
    }, [open])

    // ── Patient context ───────────────────────────────────────────────────────
    const patientContext = analysisResult ? {
        finalScore: analysisResult.hybrid?.finalScore,
        stage: analysisResult.hybrid?.stage,
        riskLevel: analysisResult.hybrid?.riskLevel,
        fractureRisk: analysisResult.hybrid?.fractureRisk,
        aiConfidence: analysisResult.aiConfidence,
    } : {}

    // ── TTS: speak text aloud ─────────────────────────────────────────────────
    const speak = useCallback((text, msgIdx) => {
        window.speechSynthesis.cancel()
        setSpeakingIdx(msgIdx)

        // Clean markdown and emojis for cleaner speech output
        const clean = text
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/[\u{1F300}-\u{1FFFF}]/gu, '')
            .replace(/[✅⚠️🔊🎙️]/g, '')
            .trim()

        const utt = new SpeechSynthesisUtterance(clean)
        utt.lang = lang.tts
        utt.rate = 0.92
        utt.pitch = 1.0
        utt.volume = 1.0

        // Find the best matching voice for the selected language
        const exact = voices.find(v => v.lang === lang.tts)
        const partial = voices.find(v => v.lang.startsWith(lang.tts.split('-')[0]))
        const def = voices.find(v => v.default)
        utt.voice = exact || partial || def || voices[0] || null

        console.log(`[TTS] lang=${lang.tts}, voice=${utt.voice?.name || 'browser default'}`)

        utt.onend = () => { setSpeakingIdx(null); setTtsPaused(false) }
        utt.onerror = (e) => { console.error('[TTS error]', e); setSpeakingIdx(null); setTtsPaused(false) }

        window.speechSynthesis.speak(utt)
    }, [lang, voices])

    const stopSpeaking = useCallback(() => {
        window.speechSynthesis.cancel()
        setSpeakingIdx(null)
        setTtsPaused(false)
    }, [])

    const pauseResume = useCallback(() => {
        const synth = window.speechSynthesis
        if (synth.paused) {
            synth.resume()
            setTtsPaused(false)
        } else {
            synth.pause()
            setTtsPaused(true)
        }
    }, [])

    // ── STT: start/stop microphone ────────────────────────────────────────────
    const toggleMic = useCallback(() => {
        if (!SR) {
            alert('Speech recognition is not supported in this browser.\nPlease use Google Chrome or Microsoft Edge.')
            return
        }

        if (isListening) {
            recRef.current?.stop()
            setIsListening(false)
            return
        }

        // Stop TTS while listening
        window.speechSynthesis.cancel()

        const rec = new SR()
        rec.lang = lang.stt
        rec.interimResults = true
        rec.continuous = false   // single phrase, then stops
        rec.maxAlternatives = 1
        recRef.current = rec

        rec.onstart = () => {
            console.log('[STT] Started, lang =', lang.stt)
            setIsListening(true)
            setInput('')
        }

        rec.onresult = (e) => {
            let interim = '', final = ''
            for (let i = e.resultIndex; i < e.results.length; i++) {
                if (e.results[i].isFinal) final += e.results[i][0].transcript
                else interim += e.results[i][0].transcript
            }
            // Show interim text as the user speaks
            setInput(final || interim)
        }

        rec.onend = () => {
            console.log('[STT] Ended')
            setIsListening(false)
            // Auto-send if there's recognised text
            setInput(prev => {
                if (prev.trim()) {
                    // Defer so state settles first
                    setTimeout(() => {
                        const text = prev.trim()
                        if (text) sendMessage(text)
                    }, 150)
                }
                return prev
            })
        }

        rec.onerror = (e) => {
            console.error('[STT error]', e.error)
            setIsListening(false)
            if (e.error === 'not-allowed') {
                alert('Microphone access was denied.\nPlease allow microphone access in your browser settings and try again.')
            } else if (e.error !== 'no-speech') {
                alert(`Speech recognition error: ${e.error}`)
            }
        }

        try { rec.start() }
        catch (err) { console.error('[STT] Could not start:', err); setIsListening(false) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isListening, lang])

    // ── Send message ──────────────────────────────────────────────────────────
    const sendMessage = async (text) => {
        const msg = (typeof text === 'string' ? text : input).trim()
        if (!msg || loading) return
        setInput('')
        window.speechSynthesis.cancel()

        const userMsg = { role: 'user', content: msg }
        const newMsgs = [...messages, userMsg]
        setMessages(newMsgs)
        setLoading(true)

        try {
            const history = newMsgs.slice(1).map(m => ({
                role: m.role === 'bot' ? 'assistant' : 'user',
                content: m.content
            }))
            const res = await axios.post(`${API_BASE}/api/chatbot`, {
                message: msg,
                history: history.slice(-6),
                patientContext,
                language: lang.label   // e.g. "తెలుగు (Telugu)", "हिन्दी (Hindi)"
            })
            const reply = res.data.reply
            const botMsg = { role: 'bot', content: reply }
            setMessages(prev => {
                const updated = [...prev, botMsg]
                if (ttsAuto) setTimeout(() => speak(reply, updated.length - 1), 300)
                return updated
            })
        } catch {
            setMessages(prev => [...prev, {
                role: 'bot',
                content: "⚠️ Connection error. Please make sure the backend is running."
            }])
        } finally {
            setLoading(false)
        }
    }

    const handleKey = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
    }

    const renderContent = (text) =>
        text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
            p.startsWith('**') && p.endsWith('**')
                ? <strong key={i}>{p.slice(2, -2)}</strong>
                : <span key={i}>{p}</span>
        )

    // Check if we have a voice for the selected language
    const hasVoice = voices.some(v =>
        v.lang === lang.tts || v.lang.startsWith(lang.tts.split('-')[0])
    )

    return (
        <>
            {/* ── FAB ── */}
            <button
                className="chatbot-fab"
                onClick={() => setOpen(o => !o)}
                title="Talk to Dr. OsteoAI"
            >
                {isListening ? '🎙️' : open ? '✕' : '🤖'}
                {!open && <span className="chatbot-badge" />}
            </button>

            {open && (
                <div className="chatbot-window">

                    {/* ── Header ── */}
                    <div className="chatbot-header">
                        <div className="chatbot-avatar">🤖</div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 15 }}>Dr. OsteoAI</div>
                            <div style={{ fontSize: 11, color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                                Groq · {lang.flag} {lang.label}
                            </div>
                        </div>
                        {/* Auto-speak toggle */}
                        <button
                            onClick={() => { setTtsAuto(v => !v); stopSpeaking() }}
                            title={ttsAuto ? 'Turn off auto-speak' : 'Turn on auto-speak'}
                            style={{ background: ttsAuto ? 'rgba(16,185,129,0.15)' : 'transparent', border: ttsAuto ? '1px solid #10b981' : '1px solid transparent', borderRadius: 8, color: ttsAuto ? '#10b981' : 'var(--color-muted)', cursor: 'pointer', width: 30, height: 30, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                        >
                            {ttsAuto ? '🔊' : '🔇'}
                        </button>
                        <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: 18, paddingLeft: 6 }}>✕</button>
                    </div>

                    {/* ── Language Selector ── */}
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border)', background: 'rgba(99,102,241,0.05)' }}>
                        <label style={{ fontSize: 11, color: 'var(--color-muted2)', fontWeight: 700, display: 'block', marginBottom: 4, letterSpacing: 0.5 }}>
                            🌐 YOUR PREFERRED LANGUAGE
                        </label>
                        <select
                            value={langIdx}
                            onChange={e => {
                                const idx = Number(e.target.value)
                                setLangIdx(idx)
                                localStorage.setItem('osteoai_lang', idx)  // persist
                                stopSpeaking()
                                recRef.current?.stop()
                                setIsListening(false)
                            }}
                            style={{ width: '100%', padding: '6px 10px', fontSize: 13, background: 'var(--color-surface2)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 6, cursor: 'pointer', outline: 'none', fontWeight: 600 }}
                        >
                            {LANGUAGES.map((l, i) => (
                                <option key={i} value={i}>{l.flag} {l.label}</option>
                            ))}
                        </select>
                        {!hasVoice && voices.length > 0 && (
                            <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>
                                ⚠️ No {lang.label} voice found on this device — TTS will use default voice.
                                Install the language pack in Windows Settings → Time &amp; Language → Speech.
                            </div>
                        )}
                    </div>

                    {/* ── Quick Prompts ── */}
                    {analysisResult && messages.length <= 2 && (
                        <div style={{ padding: '8px 10px', display: 'flex', flexWrap: 'wrap', gap: 6, borderBottom: '1px solid var(--color-border)' }}>
                            {QUICK_PROMPTS.map(q => (
                                <button key={q} onClick={() => sendMessage(q)} style={{ padding: '4px 9px', fontSize: 11, borderRadius: 100, border: '1px solid var(--color-border)', background: 'rgba(99,102,241,0.08)', color: 'var(--color-primary-light)', cursor: 'pointer', fontWeight: 600 }}>
                                    {q}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* ── Messages ── */}
                    <div className="chatbot-messages">
                        {messages.map((msg, i) => (
                            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 2 }}>
                                <div className={`chat-msg ${msg.role === 'user' ? 'user' : 'bot'}`}>
                                    {renderContent(msg.content)}
                                </div>
                                {msg.role === 'bot' && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        {/* Play / Stop */}
                                        <button
                                            onClick={() => speakingIdx === i ? stopSpeaking() : speak(msg.content, i)}
                                            title={speakingIdx === i ? 'Stop' : `Read aloud in ${lang.label}`}
                                            style={{ background: 'transparent', border: 'none', color: speakingIdx === i ? '#ef4444' : 'var(--color-muted2)', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1, transition: 'color 0.2s' }}
                                        >
                                            {speakingIdx === i ? '⏹' : '🔊'}
                                        </button>
                                        {/* Pause / Resume — only visible while this message is speaking */}
                                        {speakingIdx === i && (
                                            <button
                                                onClick={pauseResume}
                                                title={ttsPaused ? 'Resume' : 'Pause'}
                                                style={{ background: 'transparent', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 13, padding: '0 2px', lineHeight: 1 }}
                                            >
                                                {ttsPaused ? '▶' : '⏸'}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                        {loading && (
                            <div className="chat-msg bot typing">
                                <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* ── Listening indicator ── */}
                    {isListening && (
                        <div style={{ padding: '6px 14px', fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.08)', borderTop: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block', animation: 'pulse-dot 1s infinite' }} />
                            Listening in {lang.flag} {lang.label}… speak clearly
                        </div>
                    )}

                    {/* ── Input Row ── */}
                    <div className="chatbot-input-row" style={{ gap: 6 }}>
                        {/* Mic Button */}
                        <button
                            onClick={toggleMic}
                            disabled={loading}
                            title={isListening ? 'Stop listening' : `Speak in ${lang.label}`}
                            style={{ width: 38, height: 38, borderRadius: 8, flexShrink: 0, border: isListening ? '2px solid #ef4444' : '1px solid var(--color-border)', background: isListening ? 'rgba(239,68,68,0.15)' : 'var(--color-surface2)', color: isListening ? '#ef4444' : 'var(--color-muted)', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                        >
                            {isListening ? '🔴' : '🎙️'}
                        </button>

                        <input
                            className="chatbot-input"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKey}
                            placeholder={isListening ? `Listening in ${lang.label}…` : 'Type or tap 🎙️ to speak…'}
                            disabled={loading}
                            id="chatbot-input"
                        />
                        <button
                            className="chatbot-send"
                            onClick={() => sendMessage()}
                            disabled={!input.trim() || loading}
                            title="Send"
                        >➤</button>
                    </div>

                    {!SR && (
                        <div style={{ padding: '6px 12px', fontSize: 11, color: '#f59e0b', background: 'rgba(245,158,11,0.08)', textAlign: 'center' }}>
                            ⚠️ Speech recognition requires Chrome or Edge browser
                        </div>
                    )}
                </div>
            )}
        </>
    )
}

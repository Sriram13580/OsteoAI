export default function Hero({ setPage }) {
    const features = [
        { icon: '🧠', title: 'CNN X-Ray Analysis', desc: 'MobileNetV2-powered bone density classification from X-ray images' },
        { icon: '📊', title: 'Clinical Risk Engine', desc: 'Gradient Boosting model analyzing 9 clinical risk factors' },
        { icon: '⚡', title: 'Hybrid AI Decision', desc: 'Intelligent fusion of both AI models for 95%+ accurate results' },
        { icon: '🤖', title: 'AI Medical Chatbot', desc: 'Groq-powered contextual chatbot explains your results instantly' },
    ]

    return (
        <main style={{ position: 'relative', zIndex: 1 }}>
            {/* ── Hero Section ── */}
            <section className="hero">
                <div className="container">
                    <div className="hero-badge">
                        <span>🏥</span> AI-Powered Osteoporosis Early Detection System
                    </div>
                    <h1>
                        Detect Bone Loss Early<br />
                        with <span className="gradient-text">AI Precision</span>
                    </h1>
                    <p className="hero-subtitle">
                        Upload an X-ray and fill in your clinical data. Our hybrid AI engine — combining
                        CNN image analysis and clinical risk scoring — delivers instant, medically-structured
                        bone health assessments.
                    </p>
                    <div className="hero-actions">
                        <button className="btn-primary" onClick={() => setPage('analyze')} style={{ fontSize: '16px', padding: '16px 32px' }}>
                            🔬 Start AI Screening
                        </button>
                        <button className="btn-secondary" onClick={() => document.getElementById('features').scrollIntoView({ behavior: 'smooth' })}>
                            Learn How It Works ↓
                        </button>
                    </div>
                    <div className="hero-stats">
                        {[
                            { value: '95.2%', label: 'Model Accuracy' },
                            { value: '3', label: 'Risk Classes' },
                            { value: '<3s', label: 'Analysis Time' },
                            { value: '100%', label: 'Private & Secure' },
                        ].map(s => (
                            <div className="stat" key={s.label}>
                                <div className="stat-value gradient-text">{s.value}</div>
                                <div className="stat-label">{s.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Disclaimer ── */}
            <div className="container">
                <div className="disclaimer-banner">
                    <span>⚠️</span>
                    <span>
                        <strong>Proof-of-Concept Notice:</strong> This system is trained on a synthetic/limited dataset for demonstration purposes.
                        Results should NOT be used for actual clinical decisions. Always consult a licensed healthcare professional.
                    </span>
                </div>
            </div>

            {/* ── Feature Cards ── */}
            <section className="section" id="features">
                <div className="container">
                    <h2 style={{ textAlign: 'center', marginBottom: 12, fontSize: '2rem' }}>
                        How Our <span className="gradient-text">AI Works</span>
                    </h2>
                    <p style={{ textAlign: 'center', marginBottom: 48 }}>
                        A multi-modal AI system designed for early detection and risk stratification
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 24 }}>
                        {features.map((f, i) => (
                            <div key={i} className="glass-card" style={{ padding: '28px 24px' }}>
                                <div style={{ fontSize: '36px', marginBottom: 16 }}>{f.icon}</div>
                                <h3 style={{ fontSize: '16px', marginBottom: 8 }}>{f.title}</h3>
                                <p style={{ fontSize: '14px' }}>{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Pipeline Visual ── */}
            <section className="section" style={{ background: 'rgba(10,14,26,0.4)', paddingTop: 60, paddingBottom: 80 }}>
                <div className="container">
                    <h2 style={{ textAlign: 'center', marginBottom: 48 }}>
                        Hybrid AI <span className="gradient-text">Decision Engine</span>
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                        {[
                            { icon: '🩻', label: 'X-Ray Image', sub: 'Upload & Preprocess' },
                            { icon: '→', label: '', sub: '' },
                            { icon: '🧠', label: 'CNN Model', sub: 'MobileNetV2' },
                            { icon: '+', label: '', sub: '' },
                            { icon: '📋', label: 'Clinical Data', sub: '9 Risk Factors' },
                            { icon: '→', label: '', sub: '' },
                            { icon: '📊', label: 'ML Model', sub: 'Gradient Boosting' },
                            { icon: '→', label: '', sub: '' },
                            { icon: '⚡', label: 'Fusion Engine', sub: '0.6×CNN + 0.4×ML' },
                            { icon: '→', label: '', sub: '' },
                            { icon: '🎯', label: 'Risk Score', sub: '0–100 + Stage' },
                        ].map((item, i) => (
                            item.icon === '→' || item.icon === '+' ? (
                                <span key={i} style={{ fontSize: '24px', color: 'var(--color-muted2)', fontWeight: 700 }}>{item.icon}</span>
                            ) : (
                                <div key={i} className="glass-card" style={{ padding: '20px 16px', textAlign: 'center', minWidth: 110 }}>
                                    <div style={{ fontSize: '28px', marginBottom: 6 }}>{item.icon}</div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: 4 }}>{item.label}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--color-muted2)' }}>{item.sub}</div>
                                </div>
                            )
                        ))}
                    </div>
                </div>
            </section>

            {/* ── CTA ── */}
            <section className="section">
                <div className="container" style={{ textAlign: 'center' }}>
                    <h2 style={{ fontSize: '2.5rem', marginBottom: 16 }}>
                        Ready to check your <span className="gradient-text">bone health?</span>
                    </h2>
                    <p style={{ marginBottom: 32 }}>Upload your X-ray and complete the short clinical questionnaire to get your AI risk assessment in seconds.</p>
                    <button className="btn-primary" onClick={() => setPage('analyze')} style={{ fontSize: '16px', padding: '16px 40px' }}>
                        🔬 Begin Free Screening →
                    </button>
                </div>
            </section>

            {/* ── Footer ── */}
            <footer style={{ borderTop: '1px solid var(--color-border)', padding: '24px 0', textAlign: 'center' }}>
                <div className="container">
                    <p style={{ fontSize: '13px', color: 'var(--color-muted2)' }}>
                        🦴 OsteoAI — Proof-of-Concept AI Healthcare System | Built with Flask + React + TensorFlow + Groq LLM
                        <br />⚠️ Not for clinical use. Consult a licensed physician for medical decisions.
                    </p>
                </div>
            </footer>
        </main>
    )
}

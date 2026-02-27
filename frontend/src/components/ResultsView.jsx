import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
    RadialBarChart, RadialBar, PolarAngleAxis,
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts'

const STAGE_COLORS = {
    Normal: { main: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', label: 'green' },
    Osteopenia: { main: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', label: 'yellow' },
    Osteoporosis: { main: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', label: 'red' },
    // Variants for 4-tier display
    No: { main: '#06b6d4', bg: 'rgba(6,182,212,0.12)', border: 'rgba(6,182,212,0.3)', label: 'cyan' },
    Low: { main: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', label: 'green' },
}

function AnimatedGauge({ score, stage, riskLevel }) {
    const [displayScore, setDisplayScore] = useState(0)
    let colors = STAGE_COLORS[stage] || STAGE_COLORS.Normal
    if (stage === 'Normal' && riskLevel === 'No') colors = STAGE_COLORS.No
    if (stage === 'Normal' && riskLevel === 'Low') colors = STAGE_COLORS.Low

    useEffect(() => {
        let start = 0
        const end = score
        const duration = 1400
        const startTime = performance.now()
        const step = (now) => {
            const elapsed = now - startTime
            const progress = Math.min(elapsed / duration, 1)
            // ease-out-cubic
            const eased = 1 - Math.pow(1 - progress, 3)
            setDisplayScore(Math.round(eased * end))
            if (progress < 1) requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
    }, [score])

    // SVG arc-based gauge
    const radius = 90
    const strokeWidth = 14
    const cx = 110
    const cy = 110
    const startAngle = 220   // degrees from positive X-axis
    const endAngle = -40
    const totalArc = 240     // degrees
    const arcFraction = displayScore / 100
    const circumference = 2 * Math.PI * radius
    const arcLength = (totalArc / 360) * circumference

    // Convert polar to SVG
    const toXY = (angleDeg, r) => {
        const rad = (angleDeg * Math.PI) / 180
        return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) }
    }

    const describeArc = (startDeg, endDeg, r) => {
        const s = toXY(startDeg, r)
        const e = toXY(endDeg, r)
        const largeArc = (startDeg - endDeg) > 180 ? 1 : 0
        return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`
    }

    const trackPath = describeArc(startAngle, endAngle, radius)
    const fillEnd = startAngle - arcFraction * totalArc
    const fillPath = describeArc(startAngle, fillEnd, radius)

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <svg width="220" height="180" viewBox="0 0 220 180">
                {/* Track */}
                <path d={trackPath} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} strokeLinecap="round" />
                {/* Fill */}
                <path
                    d={fillPath}
                    fill="none"
                    stroke={colors.main}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    style={{ filter: `drop-shadow(0 0 8px ${colors.main})`, transition: 'all 0.05s' }}
                />
                {/* Score text */}
                <text x={cx} y={cy + 16} textAnchor="middle" fill="var(--color-text)" fontSize="38" fontWeight="900" fontFamily="Inter">
                    {displayScore}
                </text>
                <text x={cx} y={cy + 36} textAnchor="middle" fill="var(--color-muted2)" fontSize="13" fontFamily="Inter">
                    / 100
                </text>
                {/* Labels */}
                <text x={toXY(startAngle, radius + 18).x - 6} y={toXY(startAngle, radius + 18).y + 4} fill="var(--color-muted2)" fontSize="11" fontFamily="Inter">0</text>
                <text x={toXY(endAngle, radius + 18).x - 12} y={toXY(endAngle, radius + 18).y + 4} fill="var(--color-muted2)" fontSize="11" fontFamily="Inter">100</text>
            </svg>
            <div style={{ marginTop: -20, textAlign: 'center' }}>
                <span className={`badge badge-${colors.label}`} style={{ fontSize: '14px', padding: '6px 16px' }}>
                    {stage}
                </span>
            </div>
        </div>
    )
}

export default function ResultsView({ result, xrayPreview, onDownload, onReset }) {
    const { imageAnalysis, clinicalAnalysis, hybrid, aiConfidence } = result
    const stage = hybrid?.stage || 'Normal'
    const riskLevel = hybrid?.riskLevel || 'Low'
    let colors = STAGE_COLORS[stage] || STAGE_COLORS.Normal
    if (stage === 'Normal' && riskLevel === 'No') colors = STAGE_COLORS.No
    if (stage === 'Normal' && riskLevel === 'Low') colors = STAGE_COLORS.Low

    const probData = [
        { name: 'Normal', value: imageAnalysis?.probabilities?.Normal || 0, fill: '#10b981' },
        { name: 'Osteopenia', value: imageAnalysis?.probabilities?.Osteopenia || 0, fill: '#f59e0b' },
        { name: 'Osteoporosis', value: imageAnalysis?.probabilities?.Osteoporosis || 0, fill: '#ef4444' },
    ]

    const scoreData = [
        { name: 'CNN', score: Math.round((imageAnalysis?.confidence || 0)), fill: '#6366f1' },
        { name: 'Clinical', score: Math.round(clinicalAnalysis?.riskScore || 0), fill: '#06b6d4' },
        { name: 'Final', score: hybrid?.finalScore || 0, fill: colors.main },
    ]

    const CustomTooltip = ({ active, payload }) => {
        if (active && payload?.length) {
            return (
                <div style={{ background: 'var(--color-surface2)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
                    <p style={{ color: 'var(--color-text)', fontWeight: 600 }}>{payload[0].payload.name}</p>
                    <p style={{ color: payload[0].fill }}>{payload[0].value}%</p>
                </div>
            )
        }
        return null
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
        >
            {/* Top Banner */}
            <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                style={{
                    padding: '24px 32px',
                    borderRadius: 20,
                    background: colors.bg,
                    border: `1px solid ${colors.border}`,
                    marginBottom: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 16,
                    boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                    backdropFilter: 'blur(10px)'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    <motion.div
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ repeat: Infinity, duration: 3 }}
                        style={{ fontSize: '3rem' }}
                    >
                        {stage === 'Normal' && riskLevel === 'No' ? '🛡️' : stage === 'Normal' ? '✅' : stage === 'Osteopenia' ? '⚠️' : '🚨'}
                    </motion.div>
                    <div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: colors.main, letterSpacing: '-0.5px' }}>
                            {riskLevel === 'No' ? 'No Risk' : riskLevel === 'Low' ? 'Normal' : stage} Detected
                        </div>
                        <div style={{ fontSize: 14, color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                            <span>Risk: <strong style={{ color: colors.main }}>{riskLevel === 'No' ? 'None' : riskLevel}</strong></span>
                            <span style={{ opacity: 0.3 }}>|</span>
                            <span>AI Confidence: <strong>{aiConfidence}%</strong></span>
                            <span style={{ opacity: 0.3 }}>|</span>
                            <span>Fracture Risk: <strong style={{ color: colors.main }}>{hybrid?.fractureRisk}%</strong></span>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="btn-primary"
                        onClick={onDownload}
                        style={{ padding: '12px 24px', fontSize: 14, borderRadius: 12 }}
                    >
                        📄 Download PDF Report
                    </motion.button>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="btn-secondary"
                        onClick={onReset}
                        style={{ fontSize: 14, borderRadius: 12, padding: '12px 24px' }}
                    >
                        🔄 New Scan
                    </motion.button>
                </div>
            </motion.div>

            {/* DEXA Alert */}
            {hybrid?.dexaSimulationTriggered && (
                <div className="dexa-banner" style={{ marginBottom: 24 }}>
                    <span className="dexa-icon">🔴</span>
                    <span className="dexa-text">
                        <strong>DEXA Scan Recommended:</strong> High risk detected. Your AI screening score indicates significant bone loss.
                        A dual-energy X-ray absorptiometry (DEXA) scan is strongly advised. Please consult your physician immediately.
                    </span>
                </div>
            )}

            {/* Main Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
                {/* Gauge Card */}
                <div className="glass-card" style={{ padding: 28 }}>
                    <h3 style={{ marginBottom: 20, fontSize: 15, color: 'var(--color-muted)' }}>
                        🎯 Final Hybrid Risk Score
                    </h3>
                    <AnimatedGauge score={hybrid?.finalScore || 0} stage={stage} riskLevel={riskLevel} />
                    <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                        {[
                            { label: 'No Risk', range: '< 25', color: '#06b6d4' },
                            { label: 'Low Risk', range: '25-45', color: '#10b981' },
                            { label: 'Moderate', range: '45-70', color: '#f59e0b' },
                            { label: 'High Risk', range: '> 70', color: '#ef4444' },
                        ].map(r => (
                            <div key={r.label} style={{ textAlign: 'center', padding: '6px 2px', borderRadius: 8, background: 'var(--color-surface2)', border: '1px solid var(--color-border)' }}>
                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: r.color, margin: '0 auto 4px' }} />
                                <div style={{ fontSize: 9, fontWeight: 700, color: r.color, whiteSpace: 'nowrap' }}>{r.label}</div>
                                <div style={{ fontSize: 9, color: 'var(--color-muted2)' }}>{r.range}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Score Breakdown */}
                <div className="glass-card" style={{ padding: 28 }}>
                    <h3 style={{ marginBottom: 20, fontSize: 15, color: 'var(--color-muted)' }}>
                        📊 Score Breakdown
                    </h3>
                    <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={scoreData} layout="vertical" margin={{ left: 10, right: 30 }}>
                            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--color-muted2)' }} />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'var(--color-text)', fontWeight: 600 }} width={60} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="score" radius={[0, 6, 6, 0]}>
                                {scoreData.map((entry, i) => (
                                    <Cell key={i} fill={entry.fill} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                    <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 12, color: 'var(--color-muted2)', marginBottom: 6 }}>Fusion Formula:</div>
                        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'var(--color-primary-light)', background: 'var(--color-surface2)', padding: '8px 12px', borderRadius: 6 }}>
                            0.4 × CNN + 0.6 × Clinical = {hybrid?.finalScore}
                        </div>
                    </div>
                </div>
            </div>

            {/* Second Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
                {/* CNN Probabilities Chart */}
                <div className="glass-card" style={{ padding: 28 }}>
                    <h3 style={{ marginBottom: 16, fontSize: 15, color: 'var(--color-muted)' }}>
                        🧠 CNN Classification Probabilities
                    </h3>
                    <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={probData} margin={{ left: -10 }}>
                            <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--color-text)' }} />
                            <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted2)' }} unit="%" />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                {probData.map((entry, i) => (
                                    <Cell key={i} fill={entry.fill} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                    <div style={{ marginTop: 8, fontSize: 13, color: 'var(--color-muted)' }}>
                        CNN Decision: <strong style={{ color: colors.main }}>{imageAnalysis?.label}</strong>
                        &nbsp;({imageAnalysis?.confidence}% confidence)
                    </div>
                </div>

                {/* Metric Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {[
                        { label: 'Final Risk Score', value: `${hybrid?.finalScore}/100`, color: colors.main, icon: '🎯' },
                        { label: 'Fracture Risk', value: `${hybrid?.fractureRisk}%`, color: hybrid?.fractureRisk > 60 ? '#ef4444' : hybrid?.fractureRisk > 35 ? '#f59e0b' : '#10b981', icon: '🦴' },
                        { label: 'AI Confidence', value: `${aiConfidence}%`, color: '#818cf8', icon: '🤖' },
                        { label: 'Clinical Score', value: `${clinicalAnalysis?.riskScore}/100`, color: '#06b6d4', icon: '📋' },
                    ].map(m => (
                        <div key={m.label} style={{
                            padding: '14px 18px',
                            borderRadius: 12,
                            background: 'var(--color-surface2)',
                            border: '1px solid var(--color-border)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 14
                        }}>
                            <span style={{ fontSize: 22 }}>{m.icon}</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 12, color: 'var(--color-muted2)', fontWeight: 600 }}>{m.label}</div>
                                <div style={{ fontSize: 22, fontWeight: 900, color: m.color }}>{m.value}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Recommendations */}
            <div className="glass-card" style={{ padding: 28, marginBottom: 24 }}>
                <h3 style={{ marginBottom: 8, fontSize: 16 }}>
                    {stage === 'Normal' ? '✅' : stage === 'Osteopenia' ? '⚠️' : '🚨'} {stage === 'Normal' ? 'Low Risk' : stage === 'Osteopenia' ? 'Moderate Risk' : 'High Risk'} — Personalized Recommendations
                </h3>
                <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 18 }}>Tailored guidance based on your {stage} assessment:</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(hybrid?.recommendations || []).map((rec, i) => (
                        <div key={i} style={{
                            padding: '12px 16px', borderRadius: 10,
                            background: 'var(--color-surface2)', border: '1px solid var(--color-border)',
                            fontSize: 14, lineHeight: 1.6
                        }}>
                            {rec}
                        </div>
                    ))}
                </div>
            </div>

            {/* X-Ray Findings + Clinical Risk Factors */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 24, marginBottom: 24 }}>
                <div className="glass-card" style={{ padding: 24 }}>
                    <h3 style={{ marginBottom: 8, fontSize: 15 }}>🩻 X-Ray AI Findings</h3>
                    <p style={{ fontSize: 12, color: 'var(--color-muted2)', marginBottom: 14 }}>What the CNN model observed in your scan:</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {(imageAnalysis?.xrayRiskReasons || ['No X-ray image uploaded. Upload a scan for detailed findings.']).map((reason, i) => (
                            <div key={i} style={{
                                fontSize: 13, padding: '10px 14px', borderRadius: 8, lineHeight: 1.5,
                                background: 'var(--color-surface2)', border: '1px solid var(--color-border)'
                            }}>{reason}</div>
                        ))}
                    </div>
                </div>
                <div className="glass-card" style={{ padding: 24 }}>
                    <h3 style={{ marginBottom: 8, fontSize: 15 }}>📋 Your Clinical Risk Factors</h3>
                    <p style={{ fontSize: 12, color: 'var(--color-muted2)', marginBottom: 14 }}>Factors from your profile that are driving your risk score:</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {(clinicalAnalysis?.riskFactors || ['No clinical data available.']).map((factor, i) => (
                            <div key={i} style={{
                                fontSize: 13, padding: '10px 14px', borderRadius: 8, lineHeight: 1.5,
                                background: 'var(--color-surface2)', border: '1px solid var(--color-border)'
                            }}>{factor}</div>
                        ))}
                    </div>
                </div>
            </div>

            {/* X-ray Preview + Disclaimer */}
            <div style={{ display: 'grid', gridTemplateColumns: xrayPreview ? '1fr 1fr' : '1fr', gap: 24 }}>
                {xrayPreview && (
                    <div className="glass-card" style={{ padding: 20 }}>
                        <h3 style={{ marginBottom: 14, fontSize: 15, color: 'var(--color-muted)' }}>🩻 Uploaded X-Ray</h3>
                        <img src={xrayPreview} alt="X-ray" style={{ width: '100%', borderRadius: 10, border: '1px solid var(--color-border)' }} />
                    </div>
                )}
                <div className="glass-card" style={{ padding: 24 }}>
                    <h3 style={{ marginBottom: 12, fontSize: 15, color: 'var(--color-muted)' }}>⚙️ Technical Details</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {[
                            ['CNN Architecture', 'MobileNetV2 + GAP + Softmax'],
                            ['Clinical Model', 'Gradient Boosting Classifier'],
                            ['Fusion Method', '60% CNN + 40% Clinical'],
                            ['Dataset', 'Synthetic (Proof-of-Concept)'],
                            ['Image Input', '224×224 px, RGB, Normalized'],
                            ['Clinical Features', '9-factor risk vector'],
                            ['Chatbot', 'Groq LLaMA-3 (8B)'],
                            ['Timestamp', new Date().toLocaleString()],
                        ].map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
                                <span style={{ color: 'var(--color-muted2)' }}>{k}</span>
                                <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{v}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="disclaimer-banner" style={{ marginTop: 24 }}>
                <span>⚠️</span>
                <span>
                    <strong>Medical Disclaimer:</strong> This AI-generated assessment is a proof-of-concept trained on synthetic data.
                    It is NOT a clinical diagnosis. Please consult a licensed physician for proper bone health evaluation.
                    Results: {result.timestamp ? new Date(result.timestamp).toLocaleString() : 'N/A'}
                </span>
            </div>
        </motion.div>
    )
}

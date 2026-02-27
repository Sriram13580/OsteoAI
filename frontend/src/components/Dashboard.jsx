import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import axios from 'axios'
import UploadSection from './UploadSection'
import ClinicalForm from './ClinicalForm'
import ResultsView from './ResultsView'

const API_BASE = 'http://localhost:5000'

export default function Dashboard({ analysisResult, setAnalysisResult, setPage, theme, toggleTheme }) {
    const [step, setStep] = useState(1) // Start at step 1 for the new flow
    const [xrayFile, setXrayFile] = useState(null)
    const [xrayPreview, setXrayPreview] = useState(null)
    const [clinicalData, setClinicalData] = useState({
        name: '', age: '55', gender: '1', bmi: '24',
        familyHistory: '0', previousFracture: '0',
        lifestyleRisk: '0', calciumIntake: '1',
        smoking: '0', alcohol: '0'
    })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [xrayError, setXrayError] = useState(false)  // for X-ray required alert

    // New state for the new flow
    const [xray, setXray] = useState(null)
    const [result, setResult] = useState(null)

    // Reset everything when Dashboard first mounts (user came from Home)
    useEffect(() => {
        resetAll()
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (analysisResult) {
            setResult(analysisResult)
            setStep(3) // If analysisResult is pre-filled, go to results step
        }
    }, [analysisResult])

    const handleFileAccepted = (file, preview) => {
        setXrayFile(file)
        setXrayPreview(preview)
        setXray(file)
        setXrayError(false)   // clear the error once a file is chosen
    }

    const handleAnalyze = async () => {
        setLoading(true)
        setError(null)
        try {
            const formData = new FormData()
            if (xrayFile) formData.append('xray', xrayFile)
            Object.entries(clinicalData).forEach(([k, v]) => {
                if (k !== 'name') formData.append(k, v)
            })

            const res = await axios.post(`${API_BASE}/api/analyze`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 30000
            })

            setAnalysisResult({ ...res.data, patientName: clinicalData.name })
            setResult({ ...res.data, patientName: clinicalData.name }) // For the new flow
            setStep(3)
        } catch (err) {
            const msg = err.response?.data?.error || err.message || 'Analysis failed. Make sure the backend is running.'
            setError(msg)
        } finally {
            setLoading(false)
        }
    }

    const handleStartAnalysis = async (data) => {
        setClinicalData(data)
        setLoading(true)
        setError(null)
        setStep(3) // Move to loading state for analysis
        try {
            const formData = new FormData()
            if (xray) formData.append('xray', xray)
            Object.entries(data).forEach(([k, v]) => {
                if (k !== 'name') formData.append(k, v)
            })

            const res = await axios.post(`${API_BASE}/api/analyze`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 30000
            })

            setResult({ ...res.data, patientName: data.name })
            setAnalysisResult({ ...res.data, patientName: data.name })
        } catch (err) {
            const msg = err.response?.data?.error || err.message || 'Analysis failed. Make sure the backend is running.'
            setError(msg)
            setStep(2) // Go back to clinical form if error
        } finally {
            setLoading(false)
        }
    }

    const handleDownloadReport = async () => {
        if (!result) return
        try {
            const res = await axios.post(`${API_BASE}/api/report`, {
                result: result,
                patient: {
                    name: result.patientName || 'Anonymous',
                    age: clinicalData.age,
                    gender: clinicalData.gender,
                    bmi: clinicalData.bmi,
                }
            }, { responseType: 'blob' })

            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
            const a = document.createElement('a')
            a.href = url
            a.download = `OsteoAI_Report_${Date.now()}.pdf`
            a.click()
            URL.revokeObjectURL(url)
        } catch (err) {
            alert('PDF generation failed. Ensure backend is running with reportlab installed.')
        }
    }

    const reset = () => {
        setStep(0)
        setXrayFile(null)
        setXrayPreview(null)
        setAnalysisResult(null)
        setError(null)
    }

    const resetAll = () => {
        setStep(1)
        setXray(null)
        setResult(null)
        setXrayFile(null)
        setXrayPreview(null)
        setAnalysisResult(null)
        setError(null)
        setClinicalData({
            name: '', age: '55', gender: '1', bmi: '24',
            familyHistory: '0', previousFracture: '0',
            lifestyleRisk: '0', calciumIntake: '1',
            smoking: '0', alcohol: '0'
        })
    }

    return (
        <div style={{ position: 'relative', zIndex: 1, paddingBottom: 80 }}>
            {/* Slim top back bar — replaces full duplicate Navbar */}
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
                background: 'rgba(10, 14, 26, 0.92)', backdropFilter: 'blur(12px)',
                borderBottom: '1px solid var(--color-border)', padding: '12px 0'
            }}>
                <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button
                            onClick={() => setPage('home')}
                            style={{ background: 'transparent', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}
                        >← Home</button>
                        <span style={{ color: 'var(--color-border)' }}>|</span>
                        <span style={{ color: 'var(--color-muted2)', fontSize: 13 }}>AI Bone Screening</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => setPage('history')}>📋 My Results</button>
                        <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">{theme === 'dark' ? '☀️' : '🌙'}</button>
                    </div>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="container" style={{ marginTop: 100, marginBottom: 40, maxWidth: 800 }}>
                <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 10, overflow: 'hidden' }}>
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(step / 3) * 100}%` }}
                        transition={{ duration: 0.8, ease: "circOut" }}
                        style={{ height: '100%', background: 'linear-gradient(90deg, #6366f1, #a855f7)', boxShadow: '0 0 15px rgba(99,102,241,0.5)' }}
                    />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
                    {['Upload X-Ray', 'Clinical Data', 'AI Analysis'].map((label, i) => (
                        <div key={label} style={{ textAlign: 'center', opacity: step >= i + 1 ? 1 : 0.4, transition: 'opacity 0.3s' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: step >= i + 1 ? '#818cf8' : 'var(--color-muted2)' }}>Step {i + 1}</div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
                        </div>
                    ))}
                </div>
            </div>

            <main className="container" style={{ maxWidth: 1000, marginBottom: 100 }}>
                {error && (
                    <div style={{ padding: '14px 18px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#fca5a5', marginBottom: 24, fontSize: '14px' }}>
                        ⚠️ {error}
                    </div>
                )}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={step}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                    >
                        {step === 1 && (
                            <div className="glass-card" style={{ padding: 32 }}>
                                <h2 style={{ marginBottom: 8, fontSize: '1.4rem' }}>🩻 Upload X-Ray Image</h2>
                                <p style={{ marginBottom: 28, fontSize: '14px' }}>
                                    Upload a bone X-ray image (hip, spine, or wrist). Our CNN model will analyze bone density patterns.
                                </p>
                                <UploadSection
                                    onFileAccepted={(file, preview) => { handleFileAccepted(file, preview); setStep(2) }}
                                    xrayPreview={xrayPreview}
                                    fileName={xrayFile?.name}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, flexWrap: 'wrap', gap: 12 }}>
                                    {xrayError && (
                                        <div style={{
                                            flex: '1 1 100%',
                                            padding: '10px 16px',
                                            background: 'rgba(239,68,68,0.12)',
                                            border: '1px solid rgba(239,68,68,0.35)',
                                            borderRadius: 8,
                                            color: '#fca5a5',
                                            fontSize: 13,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8
                                        }}>
                                            ⚠️ Please upload an X-ray image before continuing.
                                        </div>
                                    )}
                                    <p style={{ fontSize: 13, color: 'var(--color-muted)', margin: 0 }}>
                                        🩻 Upload a hip, spine, or wrist X-ray to proceed.
                                    </p>
                                    <button
                                        className="btn-primary"
                                        onClick={() => {
                                            if (!xrayFile) {
                                                setXrayError(true)
                                                return
                                            }
                                            setXrayError(false)
                                            setStep(2)
                                        }}
                                    >
                                        Continue to Clinical Form →
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="glass-card" style={{ padding: 32 }}>
                                <h2 style={{ marginBottom: 8, fontSize: '1.4rem' }}>📋 Clinical Risk Factors</h2>
                                <p style={{ marginBottom: 28, fontSize: '14px' }}>
                                    Provide your clinical data for the Gradient Boosting risk model. All data is processed locally.
                                </p>
                                <ClinicalForm data={clinicalData} setData={setClinicalData} onSubmit={handleStartAnalysis} onBack={() => setStep(1)} />
                            </div>
                        )}

                        {step === 3 && result && (
                            <ResultsView
                                result={result}
                                xrayPreview={xray ? URL.createObjectURL(xray) : null}
                                onDownload={handleDownloadReport}
                                onReset={resetAll}
                            />
                        )}
                        {step === 3 && !result && (
                            <div style={{ textAlign: 'center', padding: '100px 0' }}>
                                <div className="loader" style={{ margin: '0 auto 20px' }}></div>
                                <h2 style={{ fontSize: 24, fontWeight: 800 }}>Analyzing Bone Density...</h2>
                                <p style={{ color: 'var(--color-muted)' }}>Our hybrid decision engine is processing your data.</p>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </main>
        </div>
    )
}

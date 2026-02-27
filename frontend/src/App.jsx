import { useState, useEffect } from 'react'
import './index.css'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Dashboard from './components/Dashboard'
import Chatbot from './components/Chatbot'
import { AnimatedBg } from './components/AnimatedBg'

const HISTORY_KEY = 'osteoai_results_history'

export default function App() {
  const [theme, setTheme] = useState('dark')
  const [page, setPage] = useState('home') // 'home' | 'analyze' | 'history'
  const [analysisResult, setAnalysisResult] = useState(null)
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []
    } catch { return [] }
  })

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
  }

  const saveResult = (result) => {
    const newHistory = [
      { ...result, savedAt: new Date().toISOString() },
      ...history,
    ].slice(0, 10)  // Keep last 10 results
    setHistory(newHistory)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory))
  }

  const handleSetResult = (result) => {
    setAnalysisResult(result)
    if (result) saveResult(result)
  }

  return (
    <div data-theme={theme}>
      <AnimatedBg />
      {/* Single global Navbar — shown on all pages */}
      {page === 'home' && (
        <Navbar theme={theme} toggleTheme={toggleTheme} page={page} setPage={setPage} historyCount={history.length} />
      )}
      {page === 'home' ? (
        <Hero setPage={setPage} />
      ) : page === 'history' ? (
        <HistoryPage history={history} setPage={setPage} setAnalysisResult={setAnalysisResult} />
      ) : (
        <Dashboard
          analysisResult={analysisResult}
          setAnalysisResult={handleSetResult}
          setPage={setPage}
          theme={theme}
          toggleTheme={toggleTheme}
        />
      )}
      <Chatbot analysisResult={analysisResult} />
    </div>
  )
}

function HistoryPage({ history, setPage, setAnalysisResult }) {
  return (
    <div style={{ minHeight: '100vh', paddingTop: 100, paddingBottom: 60 }}>
      <div className="container" style={{ maxWidth: 900 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h2 style={{ fontSize: '2rem', fontWeight: 900 }}>📋 Stored Results</h2>
            <p style={{ color: 'var(--color-muted)', marginTop: 4 }}>Your last {history.length} scans — stored locally in your browser</p>
          </div>
          <button className="btn-secondary" onClick={() => setPage('home')}>← Back to Home</button>
        </div>
        {history.length === 0 ? (
          <div className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: '4rem', marginBottom: 16 }}>🦴</div>
            <h3>No results yet</h3>
            <p style={{ color: 'var(--color-muted)', marginTop: 8 }}>Complete a screening to see your bone health history here.</p>
            <button className="btn-primary" style={{ marginTop: 24 }} onClick={() => setPage('analyze')}>🔬 Start AI Screening</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {history.map((r, i) => {
              const stage = r.hybrid?.stage || 'Unknown'
              const colors = { Normal: '#10b981', Osteopenia: '#f59e0b', Osteoporosis: '#ef4444' }
              const color = colors[stage] || '#818cf8'
              return (
                <div key={i} className="glass-card" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ fontSize: '2rem' }}>{stage === 'Normal' ? '✅' : stage === 'Osteopenia' ? '⚠️' : '🚨'}</div>
                    <div>
                      <div style={{ fontWeight: 700, color, fontSize: 16 }}>{stage}</div>
                      <div style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 2 }}>
                        Score: {r.hybrid?.finalScore}/100 &nbsp;•&nbsp; {r.patientName || 'Anonymous'} &nbsp;•&nbsp; {new Date(r.savedAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <button
                    className="btn-primary"
                    style={{ fontSize: 13, padding: '8px 18px' }}
                    onClick={() => { setAnalysisResult(r); setPage('analyze') }}
                  >View Details →</button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

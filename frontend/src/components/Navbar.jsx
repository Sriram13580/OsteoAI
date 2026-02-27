export default function Navbar({ theme, toggleTheme, page, setPage, historyCount = 0 }) {
    return (
        <nav className="navbar">
            <div className="container navbar-inner">
                <div className="logo" onClick={() => setPage('home')} style={{ cursor: 'pointer' }}>
                    <div className="logo-icon">🦴</div>
                    <span className="gradient-text">OsteoAI</span>
                </div>
                <div className="nav-links">
                    <button
                        className={`nav-link ${page === 'home' ? 'active' : ''}`}
                        onClick={() => setPage('home')}
                    >
                        Home
                    </button>
                    <button
                        className={`nav-link ${page === 'analyze' ? 'active' : ''}`}
                        onClick={() => setPage('analyze')}
                    >
                        AI Screening
                    </button>
                    <button
                        className={`nav-link ${page === 'history' ? 'active' : ''}`}
                        onClick={() => setPage('history')}
                        style={{ position: 'relative' }}
                    >
                        My Results
                        {historyCount > 0 && (
                            <span style={{
                                position: 'absolute', top: -6, right: -8,
                                background: '#6366f1', borderRadius: '50%',
                                width: 16, height: 16, fontSize: 10, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff'
                            }}>{historyCount}</span>
                        )}
                    </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                        className="btn-primary"
                        style={{ padding: '10px 20px', fontSize: '13px' }}
                        onClick={() => setPage('analyze')}
                    >
                        Start Screening →
                    </button>
                    <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
                        {theme === 'dark' ? '☀️' : '🌙'}
                    </button>
                </div>
            </div>
        </nav>
    )
}

export default function ClinicalForm({ data, setData, onSubmit, onBack }) {
    const update = (field, value) => setData(prev => ({ ...prev, [field]: value }))

    const ToggleField = ({ label, field }) => (
        <div className="form-group">
            <label className="form-label">{label}</label>
            <div className="toggle-group">
                <button
                    type="button"
                    className={`toggle-btn ${data[field] === '0' ? 'on' : ''}`}
                    onClick={() => update(field, '0')}
                >No</button>
                <button
                    type="button"
                    className={`toggle-btn ${data[field] === '1' ? 'on' : ''}`}
                    onClick={() => update(field, '1')}
                >Yes</button>
            </div>
        </div>
    )

    const handleSubmit = (e) => {
        e.preventDefault()
        if (onSubmit) onSubmit(data)
    }

    return (
        <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 24, padding: '12px 16px', background: 'rgba(99,102,241,0.07)', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                <p style={{ fontSize: '13px', color: 'var(--color-muted)' }}>
                    🔬 <strong>Clinical Risk Model:</strong> These 9 factors power our Gradient Boosting classifier.
                    The model analyzes bone health risk based on validated epidemiological research.
                </p>
            </div>

            <div className="form-grid">
                {/* Patient Name */}
                <div className="form-group">
                    <label className="form-label">Patient Name</label>
                    <input
                        id="patient-name"
                        className="form-input"
                        placeholder="e.g. Jane Smith"
                        value={data.name}
                        onChange={e => update('name', e.target.value)}
                    />
                </div>

                {/* Age */}
                <div className="form-group">
                    <label className="form-label">Age (years)</label>
                    <input
                        id="patient-age"
                        type="number"
                        min="20" max="100"
                        className="form-input"
                        value={data.age}
                        onChange={e => update('age', e.target.value)}
                    />
                </div>

                {/* Gender */}
                <div className="form-group">
                    <label className="form-label">Biological Sex</label>
                    <div className="toggle-group">
                        <button
                            type="button"
                            className={`toggle-btn ${data.gender === '0' ? 'on' : ''}`}
                            onClick={() => update('gender', '0')}
                        >Male</button>
                        <button
                            type="button"
                            className={`toggle-btn ${data.gender === '1' ? 'on' : ''}`}
                            onClick={() => update('gender', '1')}
                        >Female</button>
                    </div>
                </div>

                {/* BMI */}
                <div className="form-group">
                    <label className="form-label">BMI (kg/m²)</label>
                    <input
                        id="patient-bmi"
                        type="number"
                        min="10" max="50" step="0.1"
                        className="form-input"
                        value={data.bmi}
                        onChange={e => update('bmi', e.target.value)}
                    />
                </div>

                {/* Family History */}
                <ToggleField label="Family History of Osteoporosis" field="familyHistory" />

                {/* Previous Fracture */}
                <ToggleField label="Previous Low-Energy Fracture" field="previousFracture" />

                {/* Calcium Intake */}
                <div className="form-group">
                    <label className="form-label">Calcium Intake</label>
                    <div className="toggle-group">
                        <button type="button" className={`toggle-btn ${data.calciumIntake === '0' ? 'on' : ''}`} onClick={() => update('calciumIntake', '0')}>Inadequate</button>
                        <button type="button" className={`toggle-btn ${data.calciumIntake === '1' ? 'on' : ''}`} onClick={() => update('calciumIntake', '1')}>Adequate</button>
                    </div>
                </div>

                {/* Smoking */}
                <ToggleField label="Current Smoker" field="smoking" />

                {/* Alcohol */}
                <ToggleField label="Regular Alcohol Use (>2 units/day)" field="alcohol" />

                {/* Lifestyle Risk */}
                <div className="form-group">
                    <label className="form-label">Physical Activity Level</label>
                    <div className="risk-select">
                        <button type="button" className={`risk-option low ${data.lifestyleRisk === '0' ? 'active' : ''}`} onClick={() => update('lifestyleRisk', '0')}>Active</button>
                        <button type="button" className={`risk-option medium ${data.lifestyleRisk === '1' ? 'active' : ''}`} onClick={() => update('lifestyleRisk', '1')}>Moderate</button>
                        <button type="button" className={`risk-option high ${data.lifestyleRisk === '2' ? 'active' : ''}`} onClick={() => update('lifestyleRisk', '2')}>Sedentary</button>
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32, gap: 12 }}>
                {onBack && (
                    <button
                        type="button"
                        className="btn-secondary"
                        onClick={onBack}
                        style={{ padding: '12px 24px', fontSize: 14 }}
                    >
                        ← Back
                    </button>
                )}
                <button
                    type="submit"
                    className="btn-primary"
                    style={{ flex: 1, padding: '14px 32px', fontSize: 15, fontWeight: 700 }}
                >
                    🔬 Run AI Analysis →
                </button>
            </div>
        </form>
    )
}

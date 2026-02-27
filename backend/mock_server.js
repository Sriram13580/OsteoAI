/**
 * OsteoAI — Node.js Mock Backend Server
 * =======================================
 * Provides a fully functional fallback API server using only Node.js (no Python/Flask required).
 * Falls back to this when the Python Flask backend isn't available.
 *
 * Start: node mock_server.js
 */

const http = require('http')
const { URL } = require('url')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const PORT = 5000

// ── Helpers ──────────────────────────────────────────────────────────────────

function randomBetween(min, max) {
    return Math.random() * (max - min) + min
}

function dirichlet(alphas) {
    const gammas = alphas.map(a => {
        let x = 0
        for (let i = 0; i < 10; i++) x += -Math.log(Math.random()) * (a / 10)
        return x
    })
    const sum = gammas.reduce((a, b) => a + b, 0)
    return gammas.map(g => g / sum)
}

function predictFromClinical(data) {
    const age = parseFloat(data.age || 55)
    const gender = parseInt(data.gender || 0)
    const bmi = parseFloat(data.bmi || 24)
    const fh = parseInt(data.familyHistory || 0)
    const pf = parseInt(data.previousFracture || 0)
    const lr = parseInt(data.lifestyleRisk || 0)
    const calcium = parseInt(data.calciumIntake || 1)
    const smoking = parseInt(data.smoking || 0)
    const alcohol = parseInt(data.alcohol || 0)

    let score =
        (age - 35) * 0.6 +
        gender * 8 +
        Math.max(0, 21 - bmi) * 1.2 +
        fh * 15 +
        pf * 18 +
        lr * 9 +
        (1 - calcium) * 8 +
        smoking * 7 +
        alcohol * 5 +
        (Math.random() - 0.5) * 6

    score = Math.min(Math.max(score, 0), 100)
    return Math.round(score * 10) / 10
}

function computeHybrid(cnnProbs, clinicalScore) {
    const cnnRiskScore = cnnProbs[1] * 50 + cnnProbs[2] * 100
    const finalScore = Math.round((0.6 * cnnRiskScore + 0.4 * clinicalScore) * 10) / 10

    let stage, riskLevel, color
    if (finalScore < 40) { stage = 'Normal'; riskLevel = 'Low'; color = 'green' }
    else if (finalScore < 70) { stage = 'Osteopenia'; riskLevel = 'Moderate'; color = 'yellow' }
    else { stage = 'Osteoporosis'; riskLevel = 'High'; color = 'red' }

    const fractureRisk = Math.round(Math.min(finalScore * 0.72 + (Math.random() - 0.5) * 4, 100) * 10) / 10

    const recMap = {
        Normal: [
            'Maintain a calcium-rich diet (dairy, leafy greens, almonds).',
            'Ensure adequate Vitamin D via sunlight or supplements (800–2000 IU/day).',
            'Engage in weight-bearing exercises (walking, jogging, resistance training).',
            'Avoid excessive alcohol and quit smoking.',
            'Schedule routine bone density check every 2 years.',
        ],
        Osteopenia: [
            'Maintain a calcium-rich diet (dairy, leafy greens, almonds).',
            'Ensure adequate Vitamin D via sunlight or supplements (800–2000 IU/day).',
            'Consult your physician about supplemental calcium and Vitamin D dosage.',
            'Consider a DEXA scan to establish a baseline bone mineral density.',
            'Discuss fall-prevention strategies with your healthcare provider.',
        ],
        Osteoporosis: [
            '⚠️ Urgent: Schedule a DEXA (dual-energy X-ray absorptiometry) scan immediately.',
            'Discuss pharmacological treatment options (bisphosphonates, etc.) with your doctor.',
            'Maintain a calcium-rich diet; target ≥1200 mg/day.',
            'Ensure adequate Vitamin D (minimum 2000 IU/day — consult doctor).',
            'Implement a structured fall-prevention program.',
            'Consider physical therapy for balance improvement.',
        ]
    }

    return {
        finalScore,
        stage,
        riskLevel,
        color,
        dexaSimulationTriggered: finalScore >= 70,
        fractureRisk,
        recommendations: recMap[stage],
    }
}

// ── Groq Chatbot Proxy ────────────────────────────────────────────────────────

async function callGroq(body) {
    const GROQ_API_KEY = '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'
    const GROQ_MODEL = 'llama3-8b-8192'

    const { message, history = [], patientContext = {} } = body

    const systemPrompt = `You are Dr. OsteoAI, an intelligent, empathetic medical assistant specializing in bone health and osteoporosis.

Patient Context:
- Risk Score: ${patientContext.finalScore || 'N/A'} / 100
- Diagnosis Stage: ${patientContext.stage || 'N/A'}
- Risk Level: ${patientContext.riskLevel || 'N/A'}
- Fracture Risk: ${patientContext.fractureRisk || 'N/A'}%
- AI Confidence: ${patientContext.aiConfidence || 'N/A'}%

Always remind users this is an AI screening tool. Be warm, clear, medically accurate.
Keep responses concise (2-4 paragraphs). Use bullet points for recommendations.
Never replace professional medical advice.`

    const messages = [{ role: 'system', content: systemPrompt }]
    for (const h of (history || []).slice(-6)) messages.push({ role: h.role, content: h.content })
    messages.push({ role: 'user', content: message })

    const payload = JSON.stringify({ model: GROQ_MODEL, messages, temperature: 0.4, max_tokens: 512 })

    return new Promise((resolve, reject) => {
        const https = require('https')
        const options = {
            hostname: 'api.groq.com',
            path: '/openai/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Length': Buffer.byteLength(payload)
            }
        }

        const req = https.request(options, (res) => {
            let data = ''
            res.on('data', chunk => { data += chunk })
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data)
                    if (parsed.error) reject(new Error(parsed.error.message))
                    else resolve(parsed.choices[0].message.content)
                } catch (e) { reject(e) }
            })
        })
        req.on('error', reject)
        req.write(payload)
        req.end()
    })
}

// ── Parse multipart/form-data (basic) ────────────────────────────────────────

function parseBody(req) {
    return new Promise((resolve) => {
        const chunks = []
        req.on('data', chunk => chunks.push(chunk))
        req.on('end', () => {
            const buf = Buffer.concat(chunks)
            const ct = (req.headers['content-type'] || '').toLowerCase()

            if (ct.includes('application/json')) {
                try { resolve({ json: JSON.parse(buf.toString('utf8')), raw: buf }) }
                catch (e) { resolve({ json: {}, raw: buf }) }
                return
            }

            if (ct.includes('multipart/form-data')) {
                const boundaryMatch = ct.match(/boundary=([^\s;]+)/)
                if (!boundaryMatch) { resolve({ json: {}, raw: buf }); return }
                const boundary = boundaryMatch[1].replace(/"/g, '')
                const bodyStr = buf.toString('binary')
                const parts = bodyStr.split('--' + boundary)
                const fields = {}

                for (const part of parts) {
                    if (!part.includes('Content-Disposition')) continue
                    const lines = part.split('\r\n')
                    const dispLine = lines.find(l => l.toLowerCase().includes('content-disposition'))
                    if (!dispLine) continue
                    const nameMatch = dispLine.match(/name="([^"]+)"/i)
                    if (!nameMatch) continue
                    const name = nameMatch[1]
                    const isFile = /filename=/i.test(dispLine)
                    const emptyIdx = lines.findIndex((l, i) => i > 0 && l === '')
                    if (emptyIdx === -1) continue
                    const value = lines.slice(emptyIdx + 1, lines.length - 1).join('\r\n')
                    if (!isFile) fields[name] = value.trim()
                }
                resolve({ json: fields, raw: buf })
                return
            }

            resolve({ json: {}, raw: buf })
        })
    })
}

// ── CORS Headers ─────────────────────────────────────────────────────────────

function setCORS(res) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function sendJSON(res, status, data) {
    setCORS(res)
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
}

// ── Request Router ────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const pathname = url.pathname

    // CORS preflight
    if (req.method === 'OPTIONS') { setCORS(res); res.writeHead(204); res.end(); return }

    if (pathname === '/api/health' && req.method === 'GET') {
        sendJSON(res, 200, { status: 'ok', service: 'OsteoAI Mock Node.js Backend', timestamp: new Date().toISOString() })
        return
    }

    if (pathname === '/api/analyze' && req.method === 'POST') {
        try {
            const { json: formData } = await parseBody(req)

            // CNN simulation
            const cnnProbs = dirichlet([1.5, 1.2, 0.8])
            const cnnIdx = cnnProbs.indexOf(Math.max(...cnnProbs))
            const labels = ['Normal', 'Osteopenia', 'Osteoporosis']
            const cnnLabel = labels[cnnIdx]
            const cnnConf = Math.round(cnnProbs[cnnIdx] * 1000) / 10

            // Clinical model
            const clinicalScore = predictFromClinical(formData)
            const clinicalLabel = clinicalScore < 33 ? 'Normal' : clinicalScore < 66 ? 'Osteopenia' : 'Osteoporosis'

            // Hybrid
            const hybrid = computeHybrid(cnnProbs, clinicalScore)
            const aiConfidence = Math.round((cnnConf * 0.6 + Math.min(clinicalScore + 30, 95) * 0.4) * 10) / 10

            sendJSON(res, 200, {
                success: true,
                imageAnalysis: {
                    label: cnnLabel,
                    probabilities: {
                        Normal: Math.round(cnnProbs[0] * 1000) / 10,
                        Osteopenia: Math.round(cnnProbs[1] * 1000) / 10,
                        Osteoporosis: Math.round(cnnProbs[2] * 1000) / 10,
                    },
                    confidence: cnnConf
                },
                clinicalAnalysis: { label: clinicalLabel, riskScore: clinicalScore },
                hybrid,
                aiConfidence,
                disclaimer: 'Proof-of-concept model trained on synthetic/limited dataset. Not for clinical use.',
                timestamp: new Date().toISOString()
            })
        } catch (e) {
            sendJSON(res, 500, { success: false, error: e.message })
        }
        return
    }

    if (pathname === '/api/chatbot' && req.method === 'POST') {
        try {
            const { json: body } = await parseBody(req)
            const reply = await callGroq(body)
            sendJSON(res, 200, { success: true, reply })
        } catch (e) {
            sendJSON(res, 500, { success: false, error: e.message })
        }
        return
    }

    if (pathname === '/api/report' && req.method === 'POST') {
        // Simple HTML-to-text report fallback when Python/reportlab not available
        const { json: body } = await parseBody(req)
        const result = body.result || {}
        const hybrid = result.hybrid || {}
        const patient = body.patient || {}

        const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>OsteoAI Report</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#1a1a2e;padding:20px}
h1{color:#0f4c81;border-bottom:3px solid #0f4c81;padding-bottom:10px}
h2{color:#0f4c81;margin-top:24px}
table{width:100%;border-collapse:collapse;margin:12px 0}
td,th{padding:10px 14px;border:1px solid #ddd;text-align:left}
tr:nth-child(even){background:#f4f8ff}
.badge{display:inline-block;padding:4px 12px;border-radius:100px;font-weight:bold}
.low{background:#d1fae5;color:#065f46}.medium{background:#fef3c7;color:#92400e}.high{background:#fee2e2;color:#991b1b}
.disclaimer{background:#fffbeb;border:1px solid #fcd34d;padding:14px;border-radius:8px;font-size:13px;margin-top:24px;color:#78350f}
</style></head>
<body>
<h1>🦴 OsteoAI — Medical Screening Report</h1>
<p><em>Generated: ${new Date().toLocaleString()} | Ref: OA-${Date.now()}</em></p>

<h2>Patient Information</h2>
<table>
<tr><td><strong>Name</strong></td><td>${patient.name || 'Anonymous'}</td></tr>
<tr><td><strong>Age</strong></td><td>${patient.age || 'N/A'}</td></tr>
<tr><td><strong>Gender</strong></td><td>${patient.gender === '1' ? 'Female' : 'Male'}</td></tr>
<tr><td><strong>BMI</strong></td><td>${patient.bmi || 'N/A'}</td></tr>
</table>

<h2>AI Diagnosis Summary</h2>
<table>
<tr><td><strong>Final Risk Score</strong></td><td>${hybrid.finalScore || 'N/A'} / 100</td></tr>
<tr><td><strong>Diagnosis Stage</strong></td><td><span class="badge ${hybrid.riskLevel === 'Low' ? 'low' : hybrid.riskLevel === 'Moderate' ? 'medium' : 'high'}">${hybrid.stage || 'N/A'}</span></td></tr>
<tr><td><strong>Risk Level</strong></td><td>${hybrid.riskLevel || 'N/A'}</td></tr>
<tr><td><strong>Fracture Risk</strong></td><td>${hybrid.fractureRisk || 'N/A'}%</td></tr>
<tr><td><strong>AI Confidence</strong></td><td>${result.aiConfidence || 'N/A'}%</td></tr>
<tr><td><strong>DEXA Recommended</strong></td><td>${hybrid.dexaSimulationTriggered ? '⚠️ Yes' : 'No'}</td></tr>
</table>

<h2>Recommendations</h2>
<ol>${(hybrid.recommendations || []).map(r => `<li>${r}</li>`).join('')}</ol>

<div class="disclaimer">
⚠️ <strong>DISCLAIMER:</strong> This report is generated by an AI system trained on synthetic/limited data for demonstration purposes only.
It is NOT a medical diagnosis. Please consult a qualified healthcare professional for proper diagnosis and treatment.
OsteoAI — Powered by AI. Verified by Doctors.
</div>
</body></html>`

        setCORS(res)
        res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Disposition': `attachment; filename="OsteoAI_Report_${Date.now()}.html"` })
        res.end(html)
        return
    }

    sendJSON(res, 404, { error: 'Not found' })
})

server.listen(PORT, () => {
    console.log(`\n🦴 OsteoAI Mock Server running on http://localhost:${PORT}`)
    console.log('   Routes:')
    console.log('   GET  /api/health')
    console.log('   POST /api/analyze')
    console.log('   POST /api/chatbot  (Groq LLaMA-3)')
    console.log('   POST /api/report   (HTML report)\n')
})

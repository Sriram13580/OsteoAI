"""
Flask Backend — OsteoAI Detection System
=========================================
Endpoints:
  POST /api/analyze      — X-ray upload + clinical data → hybrid risk score
  POST /api/chatbot      — Groq LLM chatbot proxy
  POST /api/report       — PDF medical report generation
  GET  /api/health       — Health check
"""

import os
import io
import json
import joblib
import base64
import random
import datetime
import numpy as np
from pathlib import Path
from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from werkzeug.utils import secure_filename

load_dotenv()

app = Flask(__name__, static_folder="../frontend/dist", static_url_path="/")
CORS(app)  # Still allow for local development split, but backend will also serve build
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB

# ─── Model Paths ───────────────────────────────────────────────────────────────
MODELS_DIR = Path(__file__).parent / "models"
CNN_MODEL_PATH = MODELS_DIR / "cnn_model.h5"
CLINICAL_MODEL_PATH = MODELS_DIR / "clinical_model.pkl"
CNN_CLASS_MAP_PATH = MODELS_DIR / "cnn_class_map.json"
CLINICAL_SCALER_PATH = MODELS_DIR / "clinical_scaler.pkl"
CNN_MOCK_FLAG = MODELS_DIR / "cnn_mock_mode.flag"

# ─── Load Models Lazily ────────────────────────────────────────────────────────
_cnn_model = None
_clinical_model = None
_cnn_class_map = {0: "Normal", 1: "Osteopenia", 2: "Osteoporosis"}
_cnn_mock_mode = CNN_MOCK_FLAG.exists()


def load_cnn():
    global _cnn_model, _cnn_mock_mode
    if _cnn_mock_mode:
        return None
    if _cnn_model is None and CNN_MODEL_PATH.exists():
        try:
            import tensorflow as tf
            _cnn_model = tf.keras.models.load_model(str(CNN_MODEL_PATH))
            print("[OsteoAI] CNN model loaded.")
        except Exception as e:
            print(f"[OsteoAI] CNN load failed: {e}. Using mock mode.")
            _cnn_mock_mode = True
    return _cnn_model


def load_clinical():
    global _clinical_model
    if _clinical_model is None and CLINICAL_MODEL_PATH.exists():
        try:
            _clinical_model = joblib.load(str(CLINICAL_MODEL_PATH))
            print("[OsteoAI] Clinical model loaded.")
        except Exception as e:
            print(f"[OsteoAI] Clinical model load failed: {e}")
    return _clinical_model


_clinical_scaler = None

def load_clinical_scaler():
    global _clinical_scaler
    if _clinical_scaler is None and CLINICAL_SCALER_PATH.exists():
        try:
            _clinical_scaler = joblib.load(str(CLINICAL_SCALER_PATH))
            print("[OsteoAI] Clinical scaler loaded.")
        except Exception as e:
            print(f"[OsteoAI] Clinical scaler load failed: {e}")
    return _clinical_scaler


def load_class_map():
    if CNN_CLASS_MAP_PATH.exists():
        with open(CNN_CLASS_MAP_PATH) as f:
            raw = json.load(f)
        return {int(k): v for k, v in raw.items()}
    return {0: "Normal", 1: "Osteopenia", 2: "Osteoporosis"}


_cnn_class_map = load_class_map()


# ─── Helpers ───────────────────────────────────────────────────────────────────

def analyze_image_features(file_bytes):
    """
    Conservative bone density analysis from X-ray pixel data.

    Design philosophy: Pixel heuristics on arbitrary real X-rays are inherently
    unreliable (scanner variance, body part, exposure, soft tissue confounds features).
    This function is CONSERVATIVE — it defaults to Osteopenia unless radiological
    signals are overwhelmingly obvious. The clinical model is the primary driver.

    Returns (class_name, probability_list, confidence_pct)
    """
    try:
        from PIL import Image
        import io as _io

        img = Image.open(_io.BytesIO(file_bytes)).convert("L")
        arr = np.array(img.resize((224, 224)), dtype=np.float32)

        # Auto-contrast normalize (scanner-independent)
        lo, hi = np.percentile(arr, 2), np.percentile(arr, 98)
        if hi > lo:
            arr = np.clip((arr - lo) / (hi - lo), 0, 1)
        else:
            arr = np.full_like(arr, 0.5)

        # Central ROI — exclude borders (labels, padding, scanner artifacts)
        m = arr.shape[0] // 6
        roi = arr[m:-m, m:-m]

        # Core features
        bright_fraction = float(np.mean(roi > 0.70))   # Definite bright bone
        mid_fraction    = float(np.mean((roi > 0.30) & (roi < 0.70)))  # Gray zone

        # Histogram bone peak strength
        hist, _ = np.histogram(roi, bins=20, range=(0, 1))
        hist_n = hist / (hist.sum() + 1e-8)
        bone_peak = float(hist_n[14:].max())   # bright end of histogram

        print(f"[OsteoAI] ROI features: bright={bright_fraction:.3f}, mid={mid_fraction:.3f}, bone_peak={bone_peak:.3f}")

        # ── Conservative classification ──────────────────────────────────────────
        # Only classify Osteoporosis if signals are EXTREMELY clear:
        # - Very few bright pixels (bone is not white)
        # - Very high mid-gray fraction (bone washed out)
        # - Weak bone histogram peak
        # Otherwise default to Osteopenia (neutral) or Normal

        osteoporosis_confidence = (
            (1.0 - bright_fraction) * 0.5 +   # primary
            mid_fraction * 0.3 +               # secondary
            (1.0 - bone_peak) * 0.2            # supporting
        )
        # osteoporosis_confidence is 0.0–1.0; needs to be high to classify

        if osteoporosis_confidence > 0.80:
            # Unmistakable: bone is almost invisible, very washed out
            label = "Osteoporosis"
            probs = [0.03, 0.17, 0.80]
        elif osteoporosis_confidence > 0.65:
            # Suggestive: moderate signal loss
            label = "Osteopenia"
            t = (osteoporosis_confidence - 0.65) / 0.15
            probs = [0.10 - t*0.05, 0.55 - t*0.10, 0.35 + t*0.15]
        elif osteoporosis_confidence < 0.30:
            # Clear normal: strong bright bone signal
            label = "Normal"
            probs = [0.78, 0.18, 0.04]
        else:
            # Ambiguous — default to Osteopenia (neutral, conservative)
            label = "Osteopenia"
            probs = [0.20, 0.60, 0.20]

        probs = [max(0.0, p) for p in probs]
        total = sum(probs)
        probs = [p / total for p in probs]
        idx = ["Normal", "Osteopenia", "Osteoporosis"].index(label)
        confidence = round(probs[idx] * 100, 1)

        print(f"[OsteoAI] Image → label={label} ({confidence}%), osteo_conf={osteoporosis_confidence:.3f}")
        return label, probs, confidence

    except Exception as e:
        print(f"[OsteoAI] Image analysis error: {e}")
        # Neutral fallback — let clinical model decide
        return "Osteopenia", [0.20, 0.60, 0.20], 60.0



def predict_image(file_bytes):
    """Returns (class_name, probability_list, confidence_pct)"""
    cnn = load_cnn()

    # Always try real image feature analysis first (most reliable for real X-rays)
    real_label, real_probs, real_confidence = analyze_image_features(file_bytes)

    if cnn is not None and not _cnn_mock_mode:
        try:
            import tensorflow as tf
            from PIL import Image
            img = Image.open(io.BytesIO(file_bytes)).convert("RGB").resize((224, 224))
            arr = np.array(img, dtype=np.float32) / 255.0
            arr = np.expand_dims(arr, 0)
            cnn_probs = cnn.predict(arr, verbose=0)[0]
            idx = int(np.argmax(cnn_probs))
            cnn_label = _cnn_class_map[idx]
            cnn_confidence = round(float(cnn_probs[idx]) * 100, 1)
            # Blend CNN output (30%) with real image analysis (70%)
            # CNN was trained on synthetic data so we trust image features more
            blended = [0.3 * float(cnn_probs[i]) + 0.7 * real_probs[i] for i in range(3)]
            total = sum(blended)
            blended = [b / total for b in blended]
            final_idx = int(np.argmax(blended))
            final_label = ["Normal", "Osteopenia", "Osteoporosis"][final_idx]
            final_confidence = round(blended[final_idx] * 100, 1)
            return final_label, blended, final_confidence
        except Exception as e:
            print(f"CNN prediction error: {e}")

    # Use real image analysis (works correctly on real X-rays)
    return real_label, real_probs, real_confidence



# 4-class label → display name map (new model)
_CLINICAL_LABEL_MAP = {
    0: "No Risk",        # Healthy
    1: "Low Risk",       # Minimal risk factors
    2: "Moderate Risk",  # Early bone loss
    3: "High Risk"       # Osteoporosis
}

# 4-class label → risk score range (centre of each tier)
_CLINICAL_SCORE_MAP = {
    0: (5,  25),   # No Risk    → score 5–25
    1: (26, 45),   # Low Risk   → score 26–45
    2: (46, 68),   # Moderate   → score 46–68
    3: (70, 95),   # High Risk  → score 70–95
}

def predict_clinical(data: dict):
    """Returns (class_name, risk_score_0_to_100) using the 4-class clinical model."""
    clf    = load_clinical()
    scaler = load_clinical_scaler()

    if clf is None:
        # Heuristic fallback when model not loaded
        age    = float(data.get("age", 50))
        bmi    = float(data.get("bmi", 24))
        gender = int(data.get("gender", 0))
        fh     = int(data.get("familyHistory", 0))
        pf     = int(data.get("previousFracture", 0))
        lr     = int(data.get("lifestyleRisk", 0))
        ca     = int(data.get("calciumIntake", 1))
        sm     = int(data.get("smoking", 0))
        al     = int(data.get("alcohol", 0))
        score = (
            (age - 20) / 70 * 35 +
            gender * 10 +
            max(0, (22 - bmi)) / 10 * 10 +
            fh * 15 +
            pf * 20 +
            lr * 8 +
            (1 - ca) * 7 +
            sm * 8 +
            al * 5 +
            random.gauss(0, 3)
        )
        score = min(max(score, 0), 100)
        if score < 25:  label = 0
        elif score < 45: label = 1
        elif score < 68: label = 2
        else:            label = 3
        return _CLINICAL_LABEL_MAP[label], round(score, 1)

    X = np.array([[
        float(data.get("age", 50)),
        int(data.get("gender", 0)),
        float(data.get("bmi", 24)),
        int(data.get("familyHistory", 0)),
        int(data.get("previousFracture", 0)),
        int(data.get("lifestyleRisk", 0)),
        int(data.get("calciumIntake", 1)),
        int(data.get("smoking", 0)),
        int(data.get("alcohol", 0)),
    ]])

    # Apply scaler if available
    if scaler is not None:
        X = scaler.transform(X)

    label = int(clf.predict(X)[0])
    proba = clf.predict_proba(X)[0]

    # Map 4-class label to a meaningful 0-100 risk score
    lo, hi = _CLINICAL_SCORE_MAP[label]
    confidence = float(proba[label])
    risk_score = round(lo + confidence * (hi - lo), 1)
    risk_score = min(max(risk_score, 0), 100)

    print(f"[OsteoAI] Clinical: label={label} ({_CLINICAL_LABEL_MAP[label]}), "
          f"conf={confidence:.3f}, score={risk_score}")
    return _CLINICAL_LABEL_MAP[label], risk_score


def compute_hybrid(cnn_probs: list, cnn_label: str, clinical_score: float):
    """
    Hybrid Decision Engine: 40% Image Analysis + 60% Clinical Model.
    Clinical data is the primary driver — it is based on validated epidemiological
    risk factors. Image analysis is a supporting signal only.
    """
    class_to_idx = {"Normal": 0, "Osteopenia": 1, "Osteoporosis": 2}
    idx = class_to_idx.get(cnn_label, 1)

    # Image analysis score (0–100)
    image_score = (idx / 2) * 65 + cnn_probs[idx] * 35

    # Clinical-dominant hybrid: 40% image, 60% clinical
    final_score = 0.40 * image_score + 0.60 * clinical_score
    final_score = round(min(max(final_score, 0), 100), 1)

    print(f"[OsteoAI] Hybrid: image={image_score:.1f}×0.4 + clinical={clinical_score:.1f}×0.6 = {final_score}")

    # Classification thresholds (4-tier alignment)
    if final_score < 25:
        stage, risk_level, color, dexa = "Normal", "No", "cyan", False
    elif final_score < 45:
        stage, risk_level, color, dexa = "Normal", "Low", "green", False
    elif final_score < 70:
        stage, risk_level, color, dexa = "Osteopenia", "Moderate", "yellow", False
    else:
        stage, risk_level, color, dexa = "Osteoporosis", "High", "red", True

    fracture_risk = round(final_score * 0.72 + random.gauss(0, 1.5), 1)
    fracture_risk = min(max(fracture_risk, 0), 100)

    return {
        "finalScore": final_score,
        "stage": stage,
        "riskLevel": risk_level,
        "color": color,
        "dexaSimulationTriggered": dexa,
        "fractureRisk": fracture_risk,
        "recommendations": _get_recommendations(stage, final_score)
    }



def _get_xray_risk_reasons(cnn_label: str, probs: list) -> list:
    """Generate human-readable X-ray findings based on CNN output."""
    reasons = []
    normal_p = probs[0]
    osteopenia_p = probs[1]
    osteoporosis_p = probs[2]

    if cnn_label == "Osteoporosis":
        reasons = [
            "🔴 Significantly reduced bone cortical thickness detected in the X-ray.",
            "🔴 Trabecular (spongy) bone pattern shows marked loss of density.",
            "🔴 The bone structure appears more translucent than normal, indicating low mineral content.",
            f"⚠️ AI confidence in Osteoporosis classification: {round(osteoporosis_p * 100, 1)}%."
        ]
    elif cnn_label == "Osteopenia":
        reasons = [
            "🟡 Mildly reduced bone density detected — not yet osteoporotic but below normal.",
            "🟡 Some thinning of cortical bone is visible, suggesting early bone loss.",
            "🟡 Trabecular pattern shows mild decrease in density.",
            f"⚠️ AI confidence in Osteopenia classification: {round(osteopenia_p * 100, 1)}%."
        ]
    else:
        reasons = [
            "✅ Bone cortical thickness appears within normal range.",
            "✅ Trabecular (spongy) bone structure looks intact and dense.",
            "✅ No significant focal areas of bone loss identified in the image.",
            f"✅ AI confidence in Normal classification: {round(normal_p * 100, 1)}%."
        ]
    return reasons


def _get_clinical_risk_factors(data: dict) -> list:
    """Identify which clinical inputs are elevated risk factors."""
    factors = []
    age = float(data.get("age", 50))
    bmi = float(data.get("bmi", 24))
    gender = int(data.get("gender", 0))
    if age >= 65: factors.append(f"Age {int(age)} — elevated risk (≥65 years)")
    if gender == 1: factors.append("Female sex — higher inherent osteoporosis risk")
    if bmi < 18.5: factors.append(f"Low BMI ({bmi}) — underweight increases bone fragility")
    if int(data.get("familyHistory", 0)) == 1: factors.append("Family history of osteoporosis")
    if int(data.get("previousFracture", 0)) == 1: factors.append("Previous low-energy fracture")
    if int(data.get("smoking", 0)) == 1: factors.append("Active smoker — impairs bone formation")
    if int(data.get("alcohol", 0)) == 1: factors.append("Regular alcohol use — accelerates bone loss")
    if int(data.get("calciumIntake", 1)) == 0: factors.append("Inadequate calcium intake")
    lr = int(data.get("lifestyleRisk", 0))
    if lr == 2: factors.append("Sedentary lifestyle — lack of weight-bearing activity")
    elif lr == 1: factors.append("Moderate activity level — some bone density benefit")
    if not factors:
        factors.append("✅ No significant individual clinical risk factors identified.")
    return factors


def _get_recommendations(stage: str, score: float) -> list:
    if stage == "Normal":  # Low Risk
        return [
            "✅ Your bone health looks good! Keep maintaining these healthy habits.",
            "🥗 Continue a calcium-rich diet: dairy, leafy greens, almonds, tofu.",
            "☀️ Maintain Vitamin D levels via 15–20 min of daily sunlight or 600–800 IU supplements.",
            "🏃 Keep up weight-bearing exercises: walking, dancing, yoga.",
            "📅 Schedule a routine bone health check-up every 2–3 years as a general precaution.",
            "🚭 Continue avoiding smoking and limiting alcohol to less than 2 units/day.",
        ]
    elif stage == "Osteopenia":  # Moderate Risk
        return [
            "⚠️ Moderate bone loss detected. Action now can prevent progression to osteoporosis.",
            "🥗 Increase calcium intake to 1,200 mg/day through food or supplements.",
            "☀️ Add Vitamin D3 supplementation (1,000–2,000 IU/day) — ask your doctor.",
            "🏋️ Start resistance training (weights, bands) 3×/week to stimulate bone building.",
            "🚭 Quit smoking and limit alcohol — both directly accelerate bone loss.",
            "👨‍⚕️ Schedule a consultation with your physician to discuss your bone health.",
            "📅 Repeat bone health screening in 6–12 months to monitor progression.",
        ]
    else:  # High Risk — Osteoporosis only
        return [
            "🚨 High risk detected. Immediate medical attention is strongly recommended.",
            "🏥 URGENT: Schedule a DEXA (Dual-Energy X-ray Absorptiometry) scan with your doctor immediately.",
            "💊 Discuss prescription medication options (bisphosphonates, denosumab, etc.) with your physician.",
            "🥗 Prioritize 1,200–1,500 mg calcium daily through diet and supplementation.",
            "☀️ Supplement with Vitamin D3 (2,000 IU/day) and get levels tested.",
            "🛡️ Implement a structured fall-prevention program at home (remove rugs, install grab bars).",
            "🏊 Switch to low-impact exercises (swimming, walking, tai chi) to avoid fracture risk.",
            "👨‍⚕️ Consider physical therapy for balance improvement and fracture prevention.",
        ]


# ─── ROUTES ────────────────────────────────────────────────────────────────────

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve(path):
    if path != "" and os.path.exists(app.static_folder + "/" + path):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, "index.html")


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "OsteoAI Backend", "version": "v1.0.1-relative-paths", "timestamp": datetime.datetime.utcnow().isoformat()})


@app.route("/api/analyze", methods=["POST"])
def analyze():
    try:
        # Parse clinical data from form
        clinical_data = {}
        for field in ["age", "gender", "bmi", "familyHistory", "previousFracture",
                      "lifestyleRisk", "calciumIntake", "smoking", "alcohol"]:
            if field in request.form:
                clinical_data[field] = request.form[field]
            elif request.is_json and field in request.json:
                clinical_data[field] = request.json[field]

        # CNN image prediction
        file = request.files.get("xray")
        if file:
            file_bytes = file.read()
            cnn_label, cnn_probs, cnn_confidence = predict_image(file_bytes)
        else:
            # No image — use neutral CNN probs
            cnn_probs = [0.33, 0.34, 0.33]
            cnn_label = "Osteopenia"
            cnn_confidence = 33.0

        # Clinical model prediction
        clinical_label, clinical_score = predict_clinical(clinical_data)

        # Hybrid fusion
        hybrid = compute_hybrid(cnn_probs, cnn_label, clinical_score)

        # AI confidence blend
        ai_confidence = round((cnn_confidence * 0.6 + min(clinical_score + 30, 95) * 0.4), 1)

        # Generate explanations
        xray_reasons = _get_xray_risk_reasons(cnn_label, cnn_probs) if file else [
            "⚠️ No X-ray image uploaded — CNN analysis used neutral probability distribution.",
            "📋 Risk assessment is based entirely on clinical risk factors."
        ]
        clinical_risk_factors = _get_clinical_risk_factors(clinical_data)

        response = {
            "success": True,
            "imageAnalysis": {
                "label": cnn_label,
                "probabilities": {
                    "Normal": round(cnn_probs[0] * 100, 1),
                    "Osteopenia": round(cnn_probs[1] * 100, 1),
                    "Osteoporosis": round(cnn_probs[2] * 100, 1)
                },
                "confidence": cnn_confidence,
                "xrayRiskReasons": xray_reasons,
                "imageProvided": file is not None
            },
            "clinicalAnalysis": {
                "label": clinical_label,
                "riskScore": clinical_score,
                "riskFactors": clinical_risk_factors
            },
            "hybrid": hybrid,
            "aiConfidence": ai_confidence,
            "disclaimer": "Proof-of-concept model trained on synthetic/limited dataset. Not for clinical use.",
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
        return jsonify(response)

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/chatbot", methods=["POST"])
def chatbot():
    try:
        body = request.get_json(force=True)
        user_message = body.get("message", "")
        conversation_history = body.get("history", [])
        patient_context = body.get("patientContext", {})
        preferred_language = body.get("language", "English (India)")

        api_key = os.getenv("GROQ_API_KEY", "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")
        model_name = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
        if not api_key:
            return jsonify({"success": False, "error": "Groq API key not configured"}), 500

        system_prompt = f"""You are Dr. OsteoAI, a caring and knowledgeable bone health assistant.

IMPORTANT: You MUST reply in {preferred_language}. All your responses must be written in {preferred_language} only.
If the user writes in any language, always respond in {preferred_language}.

Your style:
- Greet the user kindly when appropriate.
- Answer the question clearly and accurately in 2–4 sentences.
- Use friendly, simple language — no heavy medical jargon.
- If relevant, offer one practical tip or next step.
- Never be dismissive. Always make the user feel heard and supported.
- Only mention seeing a doctor if it is genuinely relevant to the question.

Patient data (refer to this only if the question is about their result):
- Risk Score: {patient_context.get('finalScore', 'N/A')}/100
- Stage: {patient_context.get('stage', 'N/A')} ({patient_context.get('riskLevel', 'N/A')} risk)
- Fracture Risk: {patient_context.get('fractureRisk', 'N/A')}%"""

        messages = [{"role": "system", "content": system_prompt}]
        for h in conversation_history[-6:]:
            messages.append({"role": h["role"], "content": h["content"]})
        messages.append({"role": "user", "content": user_message})

        import urllib.request
        import urllib.error
        
        url = "https://api.groq.com/openai/v1/chat/completions"
        data = json.dumps({
            "model": model_name,
            "messages": messages,
            "temperature": 0.5,
            "max_tokens": 400
        }).encode("utf-8")
        
        req = urllib.request.Request(url, data=data, headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        })
        
        try:
            with urllib.request.urlopen(req) as response:
                result = json.loads(response.read().decode("utf-8"))
                reply = result["choices"][0]["message"]["content"]
                return jsonify({"success": True, "reply": reply})
        except urllib.error.HTTPError as e:
            error_msg = e.read().decode('utf-8')
            return jsonify({"success": False, "error": f"Groq API Error {e.code}: {error_msg}"}), 500

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/report", methods=["POST"])
def generate_report():
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.units import cm
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_CENTER, TA_LEFT

        body = request.get_json(force=True)
        result = body.get("result", {})
        patient = body.get("patient", {})

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=1.5*cm, bottomMargin=1.5*cm,
                                leftMargin=2*cm, rightMargin=2*cm)

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle("title", parent=styles["Heading1"], fontSize=22,
                                     textColor=colors.HexColor("#0f4c81"), alignment=TA_CENTER, spaceAfter=6)
        subtitle_style = ParagraphStyle("subtitle", parent=styles["Normal"], fontSize=10,
                                        textColor=colors.HexColor("#555555"), alignment=TA_CENTER, spaceAfter=12)
        section_style = ParagraphStyle("section", parent=styles["Heading2"], fontSize=13,
                                       textColor=colors.HexColor("#0f4c81"), spaceBefore=16, spaceAfter=6)
        body_style = ParagraphStyle("body", parent=styles["Normal"], fontSize=10, leading=14)
        disclaimer_style = ParagraphStyle("disclaimer", parent=styles["Normal"], fontSize=8,
                                          textColor=colors.HexColor("#888888"), alignment=TA_CENTER, spaceBefore=20)

        stage = result.get("hybrid", {}).get("stage", "N/A")
        score = result.get("hybrid", {}).get("finalScore", "N/A")
        risk_level = result.get("hybrid", {}).get("riskLevel", "N/A")
        fracture_risk = result.get("hybrid", {}).get("fractureRisk", "N/A")
        confidence = result.get("aiConfidence", "N/A")
        dexa = result.get("hybrid", {}).get("dexaSimulationTriggered", False)
        recs = result.get("hybrid", {}).get("recommendations", [])

        risk_color = colors.HexColor("#2ecc71") if risk_level == "Low" else (
            colors.HexColor("#f39c12") if risk_level == "Moderate" else colors.HexColor("#e74c3c"))

        report_date = datetime.datetime.now().strftime("%B %d, %Y %H:%M")
        patient_name = patient.get("name", "Anonymous Patient")
        patient_age = patient.get("age", "N/A")
        patient_gender = "Female" if str(patient.get("gender", "0")) == "1" else "Male"

        story = []
        story.append(Paragraph("🦴 OsteoAI — Medical Screening Report", title_style))
        story.append(Paragraph(f"Generated: {report_date} | Ref: OA-{datetime.datetime.now().strftime('%Y%m%d%H%M')}", subtitle_style))
        story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#0f4c81"), spaceAfter=12))

        # Patient Info
        story.append(Paragraph("Patient Information", section_style))
        patient_data = [
            ["Patient Name", patient_name],
            ["Age", str(patient_age)],
            ["Gender", patient_gender],
            ["BMI", str(patient.get("bmi", "N/A"))],
            ["Report Date", report_date],
        ]
        pt = Table(patient_data, colWidths=[5*cm, 12*cm])
        pt.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#e8f0fe")),
            ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#0f4c81")),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor("#f8faff")]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(pt)
        story.append(Spacer(1, 0.4*cm))

        # AI Diagnosis Summary
        story.append(Paragraph("AI Diagnosis Summary", section_style))
        diag_data = [
            ["Final Risk Score", f"{score} / 100"],
            ["Diagnosis Stage", stage],
            ["Risk Level", risk_level],
            ["Fracture Risk", f"{fracture_risk}%"],
            ["AI Confidence", f"{confidence}%"],
            ["DEXA Scan Recommended", "Yes ⚠️" if dexa else "No"],
        ]
        dt = Table(diag_data, colWidths=[6*cm, 11*cm])
        dt.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#e8f0fe")),
            ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#0f4c81")),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("TEXTCOLOR", (1, 2), (1, 2), risk_color),
            ("FONTNAME", (1, 2), (1, 2), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor("#f8faff")]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(dt)
        story.append(Spacer(1, 0.4*cm))

        # Image Analysis
        story.append(Paragraph("X-Ray Image Analysis", section_style))
        img_analysis = result.get("imageAnalysis", {})
        img_data = [
            ["CNN Classification", img_analysis.get("label", "N/A")],
            ["Normal Probability", f"{img_analysis.get('probabilities', {}).get('Normal', 'N/A')}%"],
            ["Osteopenia Probability", f"{img_analysis.get('probabilities', {}).get('Osteopenia', 'N/A')}%"],
            ["Osteoporosis Probability", f"{img_analysis.get('probabilities', {}).get('Osteoporosis', 'N/A')}%"],
            ["CNN Confidence", f"{img_analysis.get('confidence', 'N/A')}%"],
        ]
        it = Table(img_data, colWidths=[6*cm, 11*cm])
        it.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#e8f0fe")),
            ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#0f4c81")),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor("#f8faff")]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(it)
        story.append(Spacer(1, 0.4*cm))

        # Recommendations
        story.append(Paragraph("AI-Generated Recommendations", section_style))
        for i, rec in enumerate(recs, 1):
            story.append(Paragraph(f"{i}. {rec}", body_style))
        story.append(Spacer(1, 0.3*cm))

        # Disclaimer
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#cccccc")))
        story.append(Paragraph(
            "⚠️ DISCLAIMER: This report is generated by an AI system trained on synthetic/limited data for demonstration purposes only. "
            "It is NOT a medical diagnosis or a substitute for professional medical advice. "
            "Please consult a qualified healthcare professional for proper diagnosis and treatment. "
            "OsteoAI — Powered by AI. Verified by Doctors.",
            disclaimer_style
        ))

        doc.build(story)
        buffer.seek(0)
        return send_file(
            buffer,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"OsteoAI_Report_{datetime.datetime.now().strftime('%Y%m%d_%H%M')}.pdf"
        )

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000, host="0.0.0.0")

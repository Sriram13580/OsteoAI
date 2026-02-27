import requests, io, numpy as np
from PIL import Image

def make_img(brightness_range):
    arr = np.random.randint(brightness_range[0], brightness_range[1], (224, 224, 3), dtype=np.uint8)
    img = Image.fromarray(arr)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()

def test_tier(name, age, gender, bmi, fh, pf, lr, ca, sm, al, img_range):
    print(f"Testing {name}...")
    try:
        r = requests.post('http://localhost:5000/api/analyze',
            files={'xray': ('test.png', make_img(img_range), 'image/png')},
            data={'age':str(age),'gender':str(gender),'bmi':str(bmi),
                  'familyHistory':str(fh),'previousFracture':str(pf),
                  'lifestyleRisk':str(lr),'calciumIntake':str(ca),
                  'smoking':str(sm),'alcohol':str(al)})
        if r.status_code != 200:
            print(f"Error {r.status_code}: {r.text}")
            return
        d = r.json()
        if 'clinicalAnalysis' not in d:
            print(f"Missing clinicalAnalysis in response: {d}")
            return
        print(f"  Result => Clinical: {d['clinicalAnalysis']['label']} (Score: {d['clinicalAnalysis']['riskScore']})")
        print(f"  Hybrid => Stage: {d['hybrid']['stage']} (Final Score: {d['hybrid']['finalScore']})")
    except Exception as e:
        print(f"  Exception: {e}")

# Test 1: No Risk (Young, healthy)
test_tier("NO RISK", 25, 0, 22, 0, 0, 0, 1, 0, 0, (200, 240))

# Test 2: Low Risk (Middle-aged, slight risk)
test_tier("LOW RISK", 50, 0, 24, 0, 0, 0, 1, 1, 0, (200, 240))

# Test 3: Moderate Risk (Elderly, some loss)
test_tier("MODERATE", 65, 1, 21, 1, 0, 1, 0, 0, 0, (140, 180))

# Test 4: High Risk (Very elderly, severe factors)
test_tier("HIGH RISK", 82, 1, 18, 1, 1, 2, 0, 1, 1, (30, 80))

print("\nAll 4 tiers verification finished!")

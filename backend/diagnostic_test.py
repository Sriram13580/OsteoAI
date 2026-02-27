import requests
import os
import json

BASE_URL = "http://localhost:5000"

def test_health():
    print("Testing /api/health...")
    try:
        res = requests.get(f"{BASE_URL}/api/health")
        print(f"Status: {res.status_code}, Response: {res.json()}")
    except Exception as e:
        print(f"Failed: {e}")

def test_analyze():
    print("\nTesting /api/analyze...")
    img_path = "test_xray.png"
    from PIL import Image
    import numpy as np
    dummy_img = Image.fromarray(np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8))
    dummy_img.save(img_path)

    data = {
        "age": "65",
        "gender": "1",
        "bmi": "22.5",
        "familyHistory": "1",
        "previousFracture": "0",
        "lifestyleRisk": "1",
        "calciumIntake": "1",
        "smoking": "0",
        "alcohol": "0"
    }
    
    try:
        with open(img_path, "rb") as f:
            files = {"xray": f}
            res = requests.post(f"{BASE_URL}/api/analyze", data=data, files=files)
        print(f"Status: {res.status_code}")
        print(json.dumps(res.json(), indent=2))
        return res.json()
    except Exception as e:
        print(f"Failed: {e}")
    finally:
        if os.path.exists(img_path):
            os.remove(img_path)

if __name__ == "__main__":
    test_health()
    test_analyze()

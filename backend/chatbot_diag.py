import requests
import os
import json

BASE_URL = "http://localhost:5000"

def test_chatbot():
    print("Testing /api/chatbot...")
    payload = {
        "message": "Hi Dr. OsteoAI, what is osteoporosis?",
        "history": []
    }
    try:
        res = requests.post(f"{BASE_URL}/api/chatbot", json=payload)
        print(f"Status: {res.status_code}")
        if res.status_code == 200:
            print(f"Response: {res.json()['reply'][:100]}...")
        else:
            print(f"Error: {res.text}")
    except Exception as e:
        print(f"Failed: {e}")

if __name__ == "__main__":
    test_chatbot()

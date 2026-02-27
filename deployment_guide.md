# OsteoAI Deployment Guide

This guide provides instructions for deploying the OsteoAI application to the cloud. The project is already configured for a unified deployment where the Flask backend serves the React frontend.

## Prerequisites
- A Groq API Key (already in your `.env`)
- Docker (optional, but recommended for production)

## Option 1: Render (Recommended)
Render is perfect for containerized applications like this one.

1.  **Connect GitHub**: Push your code to a GitHub repository.
2.  **Create New Web Service**: Select "Web Service" on Render.
3.  **Use Docker**: Render will automatically detect the `Dockerfile` at the root.
4.  **Build Command**: If not using Docker, set the Build Command to: `./render-build.sh`
5.  **Start Command**: `gunicorn --bind 0.0.0.0:5000 backend.app:app`
6.  **Add Environment Variables**:
    *   `GROQ_API_KEY`: Your Groq API key.
    *   `GROQ_MODEL`: `llama-3.1-8b-instant`
7.  **Deploy**: Render will build the frontend and backend together and serve it on a single URL.

## Option 2: Vercel (Quick Frontend-Style)
Vercel can host the Python backend using Serverless Functions.

1.  **Install Vercel CLI**: `npm i -g vercel`
2.  **Deploy**: Run `vercel` from the project root.
3.  **Configure**: Vercel will use the `vercel.json` file provided to route `/api` requests to the Flask app and serve the static files for everything else.

## Option 3: Manual Execution (Local Production)
To run the production build locally:

1.  **Build Frontend**: `cd frontend && npm run build`
2.  **Run Backend**: `cd ../backend && gunicorn --bind 0.0.0.0:5000 backend.app:app`
    *   *Note: On Windows use `waitress-serve --port=5000 backend.app:app` if gunicorn is not available.*

---
### Important Note
Ensure your `backend/models` directory contains the latest `cnn_model.h5` and `clinical_model.pkl` before building the Docker image or deploying.

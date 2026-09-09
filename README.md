# FindIt AI — Campus Lost & Found with AI Ownership Verification

FindIt AI is an intelligent, multi-modal campus lost-and-found system designed to match lost and found items accurately and semantically verify ownership before releasing contact details.

Built with **TanStack Start (React 19 + Vite + SSR)**, **Tailwind CSS v4**, **FastAPI**, **PostgreSQL**, and packaged for mobile using **Capacitor 8 (Android)**.

---

## 🚀 Key Features

- **Multi-Modal AI Matching**: Combines text descriptions and image features using **CLIP** (vision-language) and **SBERT** (Sentence-BERT) embeddings with **FAISS** vector search for high-accuracy similarity matching.
- **Automated Ownership Verification**: Uses **Google Gemini AI** to conduct interactive, multi-round semantic questionnaires verifying item ownership claims without leaking private item details to claimants.
- **Automated ID & OCR Scanning**: Powered by **EasyOCR** and **OpenCV** to instantly extract student/faculty names and registration numbers from ID card photos to auto-match and notify verified owners.
- **Real-Time Notifications**: Integrated in-app and native mobile notifications alert users whenever a high-confidence match or claim status update occurs.
- **Privacy First**: Sensitive contact information (phone, hostel, classroom) remains masked until a claim is verified and accepted.
- **Cross-Platform**: Operates as a responsive SSR web application, a Dockerized cloud deployment, and a native Android application via Capacitor.

---

## 🛠️ Tech Stack & Architecture

### Frontend & Mobile
- **Framework**: [TanStack Start](https://tanstack.com/router) (React 19, TypeScript, Vite)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com), Radix UI primitives, Lucide Icons
- **State Management**: TanStack Query (React Query v5)
- **Mobile Runtime**: [Capacitor 8](https://capacitorjs.com) (Native Android APK)

### Backend & AI Engine
- **Web API**: [FastAPI](https://fastapi.tiangolo.com) (Python 3.11, Uvicorn)
- **Database**: PostgreSQL 16 with SQLAlchemy ORM
- **Computer Vision & Vector Search**:
  - `torch` & `torchvision` (CPU-optimized)
  - `transformers` & `sentence-transformers` (CLIP & SBERT)
  - `faiss-cpu` (Fast similarity indexing)
  - `easyocr` & `opencv-python-headless` (Document/ID OCR)
- **Generative AI**: `google-genai` (Gemini API for verification interviews)
- **Security & Auth**: JWT tokens, Bcrypt password hashing, SlowAPI rate limiting

### Infrastructure & Deployment
- **Containerization**: Docker & Docker Compose
- **Reverse Proxy**: Nginx (single-gateway routing for Web + Mobile API)

---

## 🌐 Networking & Port Reference

| Environment | Frontend | Backend API | Gateway / Host Access |
| :--- | :--- | :--- | :--- |
| **Local Development** | `http://localhost:8000` (Vite) | `http://localhost:8001` (FastAPI) | Vite proxies `/api` and `/uploads` to `8001` |
| **Docker Production** | `http://frontend:3000` (internal) | `http://backend:8000` (internal) | **`http://<SERVER_IP>:80` (Nginx Gateway)** |
| **Mobile (Capacitor)**| Runs in native WebView | Configured via `VITE_API_BASE_URL` | Connects to `http://<SERVER_IP>/api` via port 80 |

---

## 💻 Local Development Setup

### 1. Prerequisites
- **Node.js**: 20+ and `npm`
- **Python**: 3.10+ (Python 3.11 recommended)
- **PostgreSQL**: 14+ running locally (or SQLite for quick testing)

### 2. Backend Setup
```bash
cd backend
python -m venv .venv

# On Windows:
.\.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

# Install dependencies (with CPU PyTorch)
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and set your DATABASE_URL, SECRET_KEY, and GEMINI_API_KEY

# Start backend dev server (port 8001 matches Vite proxy)
uvicorn app.main:app --reload --port 8001
```

### 3. Frontend Setup
In a separate terminal from the project root:
```bash
# Install dependencies
npm install

# Start Vite dev server (port 8000)
npm run dev
```
Open [http://localhost:8000](http://localhost:8000) in your browser.

---

## 🐳 Docker Deployment (Production)

Deploy the entire stack with a single command on any VPS or Linux server:

```bash
# 1. Copy Docker environment template
cp .env.docker.example .env

# 2. Configure passwords and API keys in .env
# 3. Build and launch containers
docker compose up -d --build
```

- **Web App**: `http://<YOUR_VPS_IP>/`
- **API Docs (Swagger)**: `http://<YOUR_VPS_IP>/docs`
- **Health Check**: `http://<YOUR_VPS_IP>/health`

Detailed instructions, volume persistence, and future SSL setup are documented in [DEPLOYMENT.md](file:///c:/Users/Yuvan/find-trust-resolve-main/find-trust-resolve-main/DEPLOYMENT.md).

---

## 📱 Mobile App (Android / Capacitor)

The Android application is packaged using Capacitor 8:

- **Build APK**:
  ```bash
  npm run build
  npm run cap:sync
  cd android && .\gradlew.bat assembleDebug
  ```
- **Prebuilt Debug APK**: `findit-ai-debug.apk` in project root.
- **Direct ADB Install**:
  ```powershell
  adb install -r .\findit-ai-debug.apk
  ```

Complete mobile build instructions, permissions, and debugging are documented in [MOBILE_DEPLOYMENT.md](file:///c:/Users/Yuvan/find-trust-resolve-main/find-trust-resolve-main/MOBILE_DEPLOYMENT.md).

---

## 📄 License & Attribution

Developed for campus lost-and-found management with AI ownership verification.

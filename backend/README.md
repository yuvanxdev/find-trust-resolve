# FindIt AI — Backend Service

FastAPI-powered REST API and AI engine for the FindIt AI lost-and-found system.

---

## 🏗️ Architecture & Modules

The backend combines relational database management (PostgreSQL via SQLAlchemy) with local vector search and generative AI:

- **`app/main.py`**: Application entrypoint, lifespan startup (table auto-creation and FAISS index warming), rate limiting, and CORS configuration.
- **`app/auth.py`**: User authentication, JWT token issuance, and password hashing (Bcrypt).
- **`app/items.py`**: Lost & found item reporting, image uploads, search filtering, and embedding generation triggers.
- **`app/matches.py`**: Match candidates listing and match resolution.
- **`app/verification.py`**: Multi-round ownership verification questionnaire powered by Google Gemini.
- **`app/document.py`**: Proof-of-purchase and document upload handling.
- **`app/notifications.py` & `app/notification_service.py`**: User notifications for match alerts and claim approvals.
- **`app/chat.py`**: Direct messaging between verified claimants and item finders.
- **`ai/matching_engine.py`**: Multimodal feature extraction (CLIP vision-language model + SBERT textual embeddings).
- **`ai/faiss_service.py`**: In-memory FAISS L2/cosine similarity index for rapid item vector retrieval.
- **`ai/easyocr_service.py`**: OCR extraction for student/faculty ID cards.
- **`ai/gemini_service.py`**: Semantic verification analysis using Google Gemini.

---

## 📋 System Requirements

- **Python**: 3.10+ (Python 3.11 recommended)
- **PostgreSQL**: 14+ (or SQLite for development)
- **System Libraries (Linux / Debian / Docker)**:
  ```bash
  sudo apt-get update && sudo apt-get install -y libgl1 libglib2.0-0 curl
  ```
  *(Required by `opencv-python-headless` and `EasyOCR`)*

---

## ⚙️ Environment Variables (`.env`)

Create `backend/.env` based on `backend/.env.example`:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/findit_ai
SECRET_KEY=generate-a-secure-random-256-bit-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
ENVIRONMENT=development

GEMINI_API_KEY=your_gemini_api_key_here
ALLOWED_ORIGINS=http://localhost:8000,http://localhost:5173,http://localhost:3000

UPLOAD_DIRECTORY=uploads
MAX_UPLOAD_SIZE=5242880       # 5 MB
MAX_DOCUMENT_SIZE=10485760    # 10 MB
LOG_LEVEL=INFO
```

---

## 🚀 Running Locally

1. **Create and activate virtual environment:**
   ```bash
   python -m venv .venv

   # Windows:
   .\.venv\Scripts\activate
   # Linux/macOS:
   source .venv/bin/activate
   ```

2. **Install dependencies (CPU-optimized PyTorch):**
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

3. **Start development server:**
   ```bash
   # Use port 8001 when working with the Vite dev server proxy
   uvicorn app.main:app --reload --port 8001
   ```

4. **Verify Health Endpoints:**
   - App Health: [http://localhost:8001/health](http://localhost:8001/health)
   - DB Health: [http://localhost:8001/health/db](http://localhost:8001/health/db)
   - Interactive OpenAPI Docs: [http://localhost:8001/docs](http://localhost:8001/docs)

---

## 🧪 Running Tests

Run the test suite with `pytest`:
```bash
pytest
```
Tests are located in `backend/tests/` and cover authentication, item CRUD, verification workflows, and database health.

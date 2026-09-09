# FindIt AI Deployment Guide

This document provides instructions for deploying the FindIt AI application to a production environment. 

## Requirements

### Backend (Python)
- Python 3.10+
- PostgreSQL 14+
- `libpq-dev` or equivalent for psycopg2
- Minimum 2GB RAM (For loading AI models like CLIP & SBERT in memory).
- Write access to a local volume or attached storage for image uploads.

### Frontend (Node.js)
- Node.js 18+
- Static file hosting (or Node server) to serve the built SSR/CSR assets.

---

## 1. Environment Configuration

### Backend Environment Variables (`backend/.env`)

Ensure the following variables are configured securely in production:

```env
# Database Connection String
DATABASE_URL=postgresql://user:password@hostname:5432/findit_ai

# Security (JWT)
SECRET_KEY=generate-a-secure-random-256-bit-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
ENVIRONMENT=production

# Third-party Integrations
GEMINI_API_KEY=your_gemini_production_key

# CORS Settings (No wildcards in production)
ALLOWED_ORIGINS=https://findit.example.com,https://www.findit.example.com

# File Storage Config
UPLOAD_DIRECTORY=uploads
MAX_UPLOAD_SIZE=5242880  # 5MB in bytes
MAX_DOCUMENT_SIZE=10485760 # 10MB in bytes
LOG_LEVEL=INFO
```

### Frontend Environment Variables (`.env`)

In the root directory, create a `.env` for Vite containing the production API route:

```env
VITE_API_BASE_URL=https://api.findit.example.com
```

---

## 2. PostgreSQL Setup & Safety

Currently, the backend runs `Base.metadata.create_all(bind=engine)` upon application startup (see `app/main.py:lifespan`).
- **Data Preservation**: This command is non-destructive (it does not drop existing tables), but ideally, a production workflow should use Alembic for safe, versioned schema migrations.
- **Backups**: Ensure you have automated periodic backups configured for the PostgreSQL instance.

---

## 3. Backend Deployment

### Installation
1. Create a virtual environment: `python -m venv .venv`
2. Activate it: `source .venv/bin/activate` (Linux/Mac) or `.\.venv\Scripts\activate` (Windows)
3. Install dependencies: `pip install -r requirements.txt`

### Start Command
Run the backend with Uvicorn in production mode (without `--reload`):

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

> **Note**: For heavy background tasks (CLIP & SBERT embeddings), consider running a separate Celery worker in the future. Currently, these are handled by FastAPI's `BackgroundTasks`, so a single instance should have enough compute to handle incoming requests and AI processing simultaneously.

---

## 4. Frontend Deployment

### Installation & Build
1. Install dependencies: `npm install`
2. Build the production assets: `npm run build`

### Start Command (TanStack Start SSR)
You can deploy the output using the prebuilt Nitro server:

```bash
node .output/server/index.mjs
```
*Alternatively, the static assets can be deployed to Vercel/Netlify using the correct Nitro presets.*

---

## 5. File Storage Configuration

The system uses local disk storage for image and document uploads (managed via the `UPLOAD_DIRECTORY` config).
**Known Limitation (NOT VERIFIED IN CLOUD PRODUCTION):**
If you deploy this application in a distributed environment (e.g., Kubernetes, AWS ECS, Heroku) with ephemeral filesystems, uploaded images **will be lost** on container restart.
To resolve this:
- **Solution 1:** Attach a persistent volume (EBS, EFS, PVC) to the `uploads/` directory.
- **Solution 2 (Future):** Refactor `validate_and_save_image` in `app/items.py` to upload objects to AWS S3/GCS.

---

## 6. Health Checks

Two health-check endpoints are available for Load Balancers (like AWS ALB or Nginx):
- `GET /health` : Returns a quick `200 OK` if the Python process is alive.
- `GET /health/db` : Validates database connectivity, returning `200 OK` or `503 Service Unavailable`.

---

## 7. Docker Deployment (Recommended)

The project is containerized for seamless web deployment via Docker Compose. Only port `80` (Nginx Gateway) is exposed publicly on the host, while PostgreSQL and FastAPI operate strictly within the internal Docker network.

### Architecture

- **`gateway` (Nginx:alpine)**: Listens on port `80`. Routes `/api/`, `/uploads/`, and `/health` to `backend`, and `/*` to `frontend`.
- **`frontend` (TanStack Start SSR)**: Multi-stage Node 20 image serving on port `3000` (internal).
- **`backend` (FastAPI + AI)**: Python 3.11 with CPU PyTorch, FAISS, and EasyOCR on port `8000` (internal). Mounts persistent `uploads_data` volume.
- **`db` (PostgreSQL 16)**: Internal only on port `5432`. Mounts persistent `pg_data` volume.

### Deployment Steps on VPS (Public IP based)

1. **Clone the repository on your VPS:**
   ```bash
   git clone <repo-url>
   cd find-trust-resolve-main/find-trust-resolve-main
   ```

2. **Configure Environment Variables:**
   Copy the Docker environment template:
   ```bash
   cp .env.docker.example .env
   ```
   Edit `.env` and configure your secure values:
   - `POSTGRES_PASSWORD`: Choose a strong password.
   - `SECRET_KEY`: Generate a random key (`openssl rand -hex 32`).
   - `GEMINI_API_KEY`: Your Google Gemini API key.

3. **Build and Launch Containers:**
   ```bash
   docker compose up -d --build
   ```

4. **Verify Deployment:**
   - Web App: `http://<YOUR_VPS_IP>/`
   - API Health: `http://<YOUR_VPS_IP>/health`
   - DB Health: `http://<YOUR_VPS_IP>/health/db`
   - Interactive Docs: `http://<YOUR_VPS_IP>/docs`

5. **View Logs:**
   ```bash
   docker compose logs -f backend
   docker compose logs -f frontend
   docker compose logs -f gateway
   ```

---

## 8. Capacitor Mobile App Integration

For the Capacitor Android app, set `VITE_API_BASE_URL` in your frontend environment to point to your VPS IP:

```env
VITE_API_BASE_URL=http://<YOUR_VPS_IP>
```

The app connects through the Nginx gateway on port 80:
- API endpoints: `http://<YOUR_VPS_IP>/api/...`
- Uploaded photos: `http://<YOUR_VPS_IP>/uploads/...`

No direct access to port `8000` or `5432` is required from the mobile client.

---

## 9. Future Domain & SSL/HTTPS Upgrade

When you acquire a domain name (e.g., `findit.yourdomain.com`):

1. Add an **A record** in your DNS provider pointing `@` or `findit` to `<YOUR_VPS_IP>`.
2. Install Certbot on the host or use Certbot Docker:
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d findit.yourdomain.com
   ```
3. Update `ALLOWED_ORIGINS` in `.env` to include `https://findit.yourdomain.com`.
4. Rebuild/restart containers:
   ```bash
   docker compose up -d
   ```

---

## 10. Scale & Architecture Notes

- **Scale:** In-memory FAISS indices are fast but not horizontally scalable across multiple Python instances without an external vector database (like Milvus or Pinecone). Ensure the backend is pinned to a single instance or handles FAISS updates via shared memory/disk.
- **Upload Persistence:** All uploaded files are preserved in the named Docker volume `findit_uploads_data`.

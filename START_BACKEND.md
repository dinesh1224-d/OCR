# How to Start the Backend Server

## Quick Start

1. **Navigate to the backend directory:**
   ```bash
   cd app-main/backend
   ```

2. **Install dependencies (if not already installed):**
   ```bash
   pip install -r requirements.txt
   ```

3. **Install Tesseract OCR (required for OCR engine):**
   - Download the Windows installer from https://github.com/UB-Mannheim/tesseract/wiki and install it (defaults to `C:\Program Files\Tesseract-OCR`), **or**
   - Install via Chocolatey: `choco install tesseract --version=5.3.0.20221222`

   If you install it to a custom location, set the `TESSERACT_PATH` environment variable to that `tesseract.exe` path.

4. **Set up environment variables:**
   Create a `.env` file in the `backend` directory with:
   ```env
   MONGO_URL=mongodb://localhost:27017
   DB_NAME=village_records
   CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
   ```

5. **Start the server:**
   ```bash
   python run_server.py
   ```
   
   Or using uvicorn directly:
   ```bash
   uvicorn server:app --reload --host 0.0.0.0 --port 8010
   ```

6. **Verify it's running:**
   - Open http://localhost:8010/api/health in your browser
   - You should see: `{"status":"ok","timestamp":"...","database":"connected"}`

## Troubleshooting

- **"Cannot connect to backend server"**: Make sure the backend is running on port 8010
- **"OCR service not available"**: Ensure Tesseract OCR is installed and reachable. Set `TESSERACT_PATH` if you installed it in a custom directory.
- **Database errors**: Make sure MongoDB is running and MONGO_URL is correct
- **CORS errors**: Make sure CORS_ORIGINS includes your frontend URL (http://localhost:3000)

## Default Configuration

- Backend runs on: `http://localhost:8010`
- API endpoints are at: `http://localhost:8010/api/*`
- Health check: `http://localhost:8010/api/health`


# SwingIQ

AI-powered swing trading intelligence platform. Danny Cheng EMA crossover scanner, rule-based signal generation, position tracking, and trade journal.

## Prerequisites

- PostgreSQL 15 (`brew install postgresql@15 && brew services start postgresql@15`)
- Redis (`brew install redis && brew services start redis`)
- Python 3.11 (`brew install python@3.11`)
- Node.js 18+ (`brew install node`)

## Setup

### 1. Database

```bash
createdb swingiq
```

### 2. Backend

```bash
cd backend
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # edit .env with your values
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173
Backend: http://localhost:8000
API docs: http://localhost:8000/docs

## Password Gate

Set `SWINGIQ_PASSWORD` in `.env` to enable. Leave unset or empty for local dev (no password required).

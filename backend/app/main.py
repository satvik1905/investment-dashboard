from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv

from .auth import require_auth
from .database import engine, Base
from .routers import signals, stocks, positions, journal, dashboard, scanner, news

load_dotenv()

# Create all tables on startup (Alembic handles migrations in prod)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="SwingIQ API",
    description="Swing Trading Intelligence Platform",
    version="1.0.0",
    dependencies=[Depends(require_auth)],
)

_allowed_origins = list({
    os.getenv("FRONTEND_URL", "http://localhost:5173"),
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:5176",
})

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-SwingIQ-Key"],
)

app.include_router(signals.router, prefix="/api/signals", tags=["signals"])
app.include_router(stocks.router, prefix="/api/stocks", tags=["stocks"])
app.include_router(positions.router, prefix="/api/positions", tags=["positions"])
app.include_router(journal.router, prefix="/api/journal", tags=["journal"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(scanner.router, prefix="/api/scanner", tags=["scanner"])
app.include_router(news.router, prefix="/api/news", tags=["news"])


@app.get("/health", dependencies=[])
def health_check():
    return {"status": "ok", "service": "SwingIQ API"}

from celery import Celery
from celery.schedules import crontab
import os
from dotenv import load_dotenv

load_dotenv()

celery_app = Celery(
    "swingiq",
    broker=os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0"),
    backend=os.getenv("REDIS_URL", "redis://localhost:6379"),
    include=["app.tasks.scanner"],
)

celery_app.conf.beat_schedule = {
    # Weekly scanner — every Friday at 4:15 PM ET after market close
    "weekly-scanner": {
        "task": "app.tasks.scanner.run_weekly_scanner",
        "schedule": crontab(hour=16, minute=15, day_of_week=4),  # Friday
    },
}

celery_app.conf.timezone = "America/New_York"
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.accept_content = ["json"]

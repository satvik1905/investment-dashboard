from logging.config import fileConfig
import logging
from sqlalchemy import engine_from_config, pool
from sqlalchemy.engine import make_url
from alembic import context
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# Read DATABASE_URL before importing the app: app.database calls load_dotenv(),
# which would pull the URL from .env and make a bare `alembic upgrade head` hit
# whatever database .env points at (production). Only an explicit
# DATABASE_URL=... overrides the localhost URL in alembic.ini.
_DATABASE_URL = os.environ.get("DATABASE_URL")

from app.database import Base
from app import models  # noqa: F401 — registers all models

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

if _DATABASE_URL:
    # configparser treats % as interpolation
    config.set_main_option("sqlalchemy.url", _DATABASE_URL.replace("%", "%%"))

logging.getLogger("alembic.env").info(
    "Target database host: %s", make_url(config.get_main_option("sqlalchemy.url")).host
)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

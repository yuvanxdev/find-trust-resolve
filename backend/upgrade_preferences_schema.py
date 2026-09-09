import os
import sys

# Add the parent directory to sys.path so we can import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import engine
from sqlalchemy import text
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def upgrade_schema():
    if not engine:
        logger.error("No database engine available. Check database.py configuration.")
        return

    with engine.connect() as conn:
        # Check if it's PostgreSQL or SQLite to use the right JSON type syntax
        is_postgres = engine.dialect.name == "postgresql"
        
        try:
            if is_postgres:
                conn.execute(text("ALTER TABLE users ADD COLUMN preferred_categories JSON;"))
            else:
                conn.execute(text("ALTER TABLE users ADD COLUMN preferred_categories JSON;"))
            conn.commit()
            logger.info("Added preferred_categories column.")
        except Exception as e:
            logger.info(f"preferred_categories column might already exist or error occurred: {e}")
            
        try:
            if is_postgres:
                conn.execute(text("ALTER TABLE users ADD COLUMN preferred_locations JSON;"))
            else:
                conn.execute(text("ALTER TABLE users ADD COLUMN preferred_locations JSON;"))
            conn.commit()
            logger.info("Added preferred_locations column.")
        except Exception as e:
            logger.info(f"preferred_locations column might already exist or error occurred: {e}")

    logger.info("Schema upgrade complete.")

if __name__ == "__main__":
    upgrade_schema()

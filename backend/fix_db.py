import sys
import logging
from sqlalchemy import text
from app.database import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def fix():
    logger.info("Adding missing columns to users table...")
    alter_statements = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS year_of_study VARCHAR;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS section_class VARCHAR;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS graduation_year VARCHAR;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS campus VARCHAR;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS building VARCHAR;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS floor VARCHAR;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS classroom VARCHAR;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS lab_room VARCHAR;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS hostel VARCHAR;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS show_email INTEGER DEFAULT 1;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS show_phone INTEGER DEFAULT 0;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS show_classroom INTEGER DEFAULT 1;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS show_hostel INTEGER DEFAULT 0;"
    ]
    
    with engine.connect() as conn:
        for stmt in alter_statements:
            try:
                conn.execute(text(stmt))
                conn.commit()
                logger.info(f"Executed: {stmt}")
            except Exception as e:
                logger.info(f"Skipped execution: {stmt} -> {e}")
                conn.rollback()

if __name__ == "__main__":
    fix()

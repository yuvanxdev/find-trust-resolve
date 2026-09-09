import sys
import logging
from sqlalchemy import text
from app.database import engine, Base
from app.models import Notification, Match

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def upgrade():
    logger.info("Upgrading schema...")
    with engine.begin() as conn:
        # Create notifications table if it doesn't exist
        Base.metadata.create_all(bind=engine, tables=[Notification.__table__])
        logger.info("Ensured notifications table exists.")
        
        # Check and add resolved_by_user_id
        try:
            conn.execute(text("ALTER TABLE matches ADD COLUMN resolved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;"))
            logger.info("Added resolved_by_user_id column.")
        except Exception as e:
            logger.info(f"Column resolved_by_user_id might already exist: {e}")
            
        # Check and add resolved_at
        try:
            conn.execute(text("ALTER TABLE matches ADD COLUMN resolved_at TIMESTAMP WITH TIME ZONE;"))
            logger.info("Added resolved_at column.")
        except Exception as e:
            logger.info(f"Column resolved_at might already exist: {e}")
            
        # Check and add ReturnWorkflow schema changes
        Base.metadata.create_all(bind=engine, tables=[ReturnWorkflow.__table__])
        logger.info("Ensured return_workflows table exists.")
        
        alter_statements = [
            "ALTER TABLE return_workflows ADD COLUMN owner_contact_shared INTEGER DEFAULT 0;",
            "ALTER TABLE return_workflows ADD COLUMN finder_contact_shared INTEGER DEFAULT 0;",
            "ALTER TABLE return_workflows ADD COLUMN owner_contact_info JSON;",
            "ALTER TABLE return_workflows ADD COLUMN finder_contact_info JSON;",
            "ALTER TABLE return_workflows ADD COLUMN meeting_location VARCHAR;",
            "ALTER TABLE return_workflows ADD COLUMN meeting_location_shared_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;",
            "ALTER TABLE users ADD COLUMN phone_number VARCHAR;",
            "ALTER TABLE users ADD COLUMN bio VARCHAR;",
            "ALTER TABLE users ADD COLUMN department VARCHAR;",
            "ALTER TABLE users ADD COLUMN year_of_study VARCHAR;",
            "ALTER TABLE users ADD COLUMN section_class VARCHAR;",
            "ALTER TABLE users ADD COLUMN graduation_year VARCHAR;",
            "ALTER TABLE users ADD COLUMN campus VARCHAR;",
            "ALTER TABLE users ADD COLUMN building VARCHAR;",
            "ALTER TABLE users ADD COLUMN floor VARCHAR;",
            "ALTER TABLE users ADD COLUMN classroom VARCHAR;",
            "ALTER TABLE users ADD COLUMN lab_room VARCHAR;",
            "ALTER TABLE users ADD COLUMN hostel VARCHAR;",
            "ALTER TABLE users ADD COLUMN timezone VARCHAR;",
            "ALTER TABLE users ADD COLUMN show_email INTEGER DEFAULT 1;",
            "ALTER TABLE users ADD COLUMN show_phone INTEGER DEFAULT 0;",
            "ALTER TABLE users ADD COLUMN show_classroom INTEGER DEFAULT 1;",
            "ALTER TABLE users ADD COLUMN show_hostel INTEGER DEFAULT 0;"
        ]
        
        for stmt in alter_statements:
            try:
                conn.execute(text(stmt))
                logger.info(f"Executed: {stmt}")
            except Exception as e:
                logger.info(f"Skipped execution (column might already exist): {stmt} -> {e}")
            
    logger.info("Schema upgrade complete.")
if __name__ == "__main__":
    upgrade()

import logging
from sqlalchemy import text
from app.database import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def upgrade_db():
    try:
        with engine.begin() as conn:
            # Add columns if they don't exist
            try:
                conn.execute(text("ALTER TABLE items ADD COLUMN image_embedding FLOAT[]"))
                logger.info("Added image_embedding column.")
            except Exception as e:
                logger.info(f"image_embedding might already exist: {e}")
                
            try:
                conn.execute(text("ALTER TABLE items ADD COLUMN text_embedding FLOAT[]"))
                logger.info("Added text_embedding column.")
            except Exception as e:
                logger.info(f"text_embedding might already exist: {e}")
                
        logger.info("Database upgraded successfully.")
    except Exception as e:
        logger.error(f"Failed to upgrade db: {e}")

if __name__ == "__main__":
    upgrade_db()

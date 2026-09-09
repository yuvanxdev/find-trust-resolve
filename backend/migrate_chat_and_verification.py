import os
from sqlalchemy import create_engine, text
from app.models import Base
from app.config import settings

def migrate():
    engine = create_engine(settings.DATABASE_URL)
    
    # 1. Add new columns to verifications table
    # Using raw SQL for ALTER TABLE since SQLAlchemy create_all doesn't alter existing tables
    
    with engine.connect() as conn:
        try:
            # We don't know the exact schema currently, let's try to add columns one by one
            # finder_user_id
            conn.execute(text("ALTER TABLE verifications ADD COLUMN finder_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE"))
        except Exception as e:
            print(f"finder_user_id might already exist or error: {e}")
            
        try:
            conn.execute(text("ALTER TABLE verifications ADD COLUMN claimant_status VARCHAR DEFAULT 'PENDING'"))
        except Exception as e:
            print(f"claimant_status error: {e}")
            
        try:
            conn.execute(text("ALTER TABLE verifications ADD COLUMN claimant_answers JSON"))
        except Exception as e:
            print(f"claimant_answers error: {e}")
            
        try:
            conn.execute(text("ALTER TABLE verifications ADD COLUMN finder_status VARCHAR DEFAULT 'PENDING'"))
        except Exception as e:
            print(f"finder_status error: {e}")
            
        try:
            conn.execute(text("ALTER TABLE verifications ADD COLUMN finder_answers JSON"))
        except Exception as e:
            print(f"finder_answers error: {e}")
            
        conn.commit()

    # 2. Create new tables (ChatSession, ChatMessage)
    print("Creating new tables...")
    Base.metadata.create_all(bind=engine)
    print("Done!")

if __name__ == "__main__":
    migrate()

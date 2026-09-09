import sys
from sqlalchemy import text
from app.database import engine

def upgrade():
    with engine.begin() as conn:
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN preference_notifications_enabled INTEGER DEFAULT 1;"))
            print("Successfully added preference_notifications_enabled to users table.")
        except Exception as e:
            if "duplicate column name" in str(e).lower() or "already exists" in str(e).lower():
                print("Column already exists.")
            else:
                print(f"Error: {e}")
                sys.exit(1)

if __name__ == "__main__":
    upgrade()

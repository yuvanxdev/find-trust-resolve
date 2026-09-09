import sys
from sqlalchemy import text
from app.database import engine

def upgrade():
    # In PostgreSQL, ALTER TYPE ... ADD VALUE must run outside a transaction block (autocommit mode).
    raw_conn = engine.raw_connection()
    try:
        raw_conn.set_isolation_level(0) # AUTOCOMMIT
        with raw_conn.cursor() as cursor:
            # 1. Add PREFERRED_ITEM_ALERT to notificationtype enum
            try:
                cursor.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'PREFERRED_ITEM_ALERT';")
                print("Successfully added PREFERRED_ITEM_ALERT to notificationtype enum.")
            except Exception as e:
                print(f"Enum note: {e}")

            # 2. Add related_item_id column to notifications table
            try:
                cursor.execute("""
                    ALTER TABLE notifications 
                    ADD COLUMN IF NOT EXISTS related_item_id INTEGER REFERENCES items(id) ON DELETE CASCADE;
                """)
                print("Successfully ensured related_item_id column on notifications table.")
            except Exception as e:
                print(f"Column note: {e}")

            # 3. Add index on related_item_id
            try:
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS ix_notifications_related_item_id ON notifications (related_item_id);
                """)
                print("Successfully created index on related_item_id.")
            except Exception as e:
                print(f"Index note: {e}")

            # 4. Ensure preference_notifications_enabled on users
            try:
                cursor.execute("""
                    ALTER TABLE users 
                    ADD COLUMN IF NOT EXISTS preference_notifications_enabled INTEGER DEFAULT 1;
                """)
                print("Successfully ensured preference_notifications_enabled on users.")
            except Exception as e:
                print(f"Users column note: {e}")

    finally:
        raw_conn.close()

if __name__ == "__main__":
    upgrade()

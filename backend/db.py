# db.py
import os
import logging
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import time
from contextlib import contextmanager
from typing import List, Dict, Any, Optional, Tuple
from passlib.context import CryptContext

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("powerball-db")

# For hashing user passwords
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class PostgresDB:
    def __init__(
        self,
        db_url: Optional[str] = None,
        max_retries: int = 15,
        retry_interval: int = 5
    ):
        self.db_url = db_url or os.environ["DATABASE_URL"]
        self.max_retries = max_retries
        self.retry_interval = retry_interval
        self.conn = None
        logger.info(f"Database connector initialized")

    def connect(self) -> bool:
        """Connect to the database (with retries)."""
        for attempt in range(1, self.max_retries + 1):
            try:
                if self.conn and not self.conn.closed:
                    return True
                logger.info(f"Connecting to database ({attempt}/{self.max_retries})")
                self.conn = psycopg2.connect(self.db_url, cursor_factory=RealDictCursor)
                self.conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
                logger.info("Successfully connected to the database")
                return True
            except Exception as e:
                logger.error(f"Connection attempt {attempt} failed: {e}")
                time.sleep(self.retry_interval)
        logger.error("Exceeded maximum connection retries")
        return False

    def close(self) -> None:
        """Close the database connection."""
        if self.conn and not self.conn.closed:
            self.conn.close()
            logger.info("Database connection closed")

    @contextmanager
    def cursor(self):
        """Context manager for a cursor."""
        if not self.connect():
            raise RuntimeError("Database connection failed")
        cur = self.conn.cursor()
        try:
            yield cur
        finally:
            cur.close()

    def execute(self, query: str, params: Tuple = None) -> Optional[List[Dict[str, Any]]]:
        """
        Execute a SQL statement. If it returns rows, fetch and return them.
        """
        with self.cursor() as cur:
            cur.execute(query, params)
            if cur.description:
                return cur.fetchall()
        return None

    def init_schema(self) -> None:
        """Create all tables, indexes, and views if they don’t exist."""
        stmts = [
            # 1. USERS
            """
            CREATE TABLE IF NOT EXISTS users (
              id SERIAL PRIMARY KEY,
              username VARCHAR(100) UNIQUE NOT NULL,
              email VARCHAR(255) UNIQUE,
              password_hash TEXT,
              created_at TIMESTAMPTZ DEFAULT NOW()
            );
            """,
            # 2. DRAWS
            """
            CREATE TABLE IF NOT EXISTS draws (
              id SERIAL PRIMARY KEY,
              draw_number INTEGER UNIQUE NOT NULL,
              draw_date DATE NOT NULL,
              white_balls INTEGER[] NOT NULL,
              powerball INTEGER NOT NULL,
              jackpot_amount NUMERIC(15,2) DEFAULT 0,
              winners INTEGER DEFAULT 0,
              source VARCHAR(50),
              created_at TIMESTAMPTZ DEFAULT NOW(),
              CONSTRAINT ck_white_balls_len CHECK (array_length(white_balls,1)=5),
              CONSTRAINT ck_powerball_range CHECK (powerball BETWEEN 1 AND 26)
            );
            """,
            # 3. NUMBERS
            """
            CREATE TABLE IF NOT EXISTS numbers (
              id SERIAL PRIMARY KEY,
              draw_id INTEGER REFERENCES draws(id) ON DELETE CASCADE,
              position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 6),
              number INTEGER NOT NULL CHECK (number BETWEEN 1 AND 69),
              is_powerball BOOLEAN DEFAULT FALSE,
              UNIQUE(draw_id, position)
            );
            """,
            # 4. USER_STATS
            """
            CREATE TABLE IF NOT EXISTS user_stats (
              id SERIAL PRIMARY KEY,
              user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
              draws_added INTEGER DEFAULT 0,
              predictions_made INTEGER DEFAULT 0,
              analysis_runs INTEGER DEFAULT 0,
              checks_performed INTEGER DEFAULT 0,
              wins INTEGER DEFAULT 0,
              updated_at TIMESTAMPTZ DEFAULT NOW(),
              UNIQUE(user_id)
            );
            """,
            # 5. PREDICTIONS
            """
            CREATE TABLE IF NOT EXISTS predictions (
              id SERIAL PRIMARY KEY,
              user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
              method VARCHAR(50) NOT NULL,
              confidence NUMERIC(5,2) CHECK (confidence BETWEEN 0 AND 100),
              rationale TEXT,
              created_at TIMESTAMPTZ DEFAULT NOW()
            );
            """,
            # 6. PREDICTION_NUMBERS
            """
            CREATE TABLE IF NOT EXISTS prediction_numbers (
              id SERIAL PRIMARY KEY,
              prediction_id INTEGER REFERENCES predictions(id) ON DELETE CASCADE,
              position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 6),
              number INTEGER NOT NULL CHECK (
                (position <= 5 AND number BETWEEN 1 AND 69)
                OR (position = 6 AND number BETWEEN 1 AND 26)
              ),
              is_powerball BOOLEAN DEFAULT FALSE,
              UNIQUE(prediction_id, position)
            );
            """,
            # 7. EXPECTED_COMBINATIONS
            """
            CREATE TABLE IF NOT EXISTS expected_combinations (
              id SERIAL PRIMARY KEY,
              score NUMERIC(5,2) CHECK (score BETWEEN 0 AND 100),
              method VARCHAR(50) NOT NULL,
              reason TEXT,
              created_at TIMESTAMPTZ DEFAULT NOW()
            );
            """,
            # 8. USER_CHECKS
            """
            CREATE TABLE IF NOT EXISTS user_checks (
              id SERIAL PRIMARY KEY,
              user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
              draw_id INTEGER REFERENCES draws(id) ON DELETE CASCADE,
              white_matches INTEGER[] DEFAULT '{}',
              powerball_match BOOLEAN DEFAULT FALSE,
              is_winner BOOLEAN DEFAULT FALSE,
              prize VARCHAR(100),
              created_at TIMESTAMPTZ DEFAULT NOW()
            );
            """,
            # 9. ANALYSIS_RESULTS
            """
            CREATE TABLE IF NOT EXISTS analysis_results (
              id SERIAL PRIMARY KEY,
              type VARCHAR(50) NOT NULL,
              parameters JSONB,
              result_data JSONB NOT NULL,
              created_at TIMESTAMPTZ DEFAULT NOW()
            );
            """,
            # INDEXES
            "CREATE INDEX IF NOT EXISTS idx_draws_number ON draws(draw_number);",
            "CREATE INDEX IF NOT EXISTS idx_draws_date   ON draws(draw_date);",
            "CREATE INDEX IF NOT EXISTS idx_numbers_draw  ON numbers(draw_id);",
            "CREATE INDEX IF NOT EXISTS idx_numbers_num   ON numbers(number);",
            "CREATE INDEX IF NOT EXISTS idx_userchecks_draw ON user_checks(draw_id);",
            "CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_id);",
            # VIEWS
            """
            CREATE OR REPLACE VIEW view_all_draws AS
              SELECT id, draw_number, draw_date, white_balls, powerball,
                     jackpot_amount, winners, created_at
                FROM draws
               ORDER BY draw_date DESC, draw_number DESC;
            """,
            """
            CREATE OR REPLACE VIEW view_latest_draw AS
              SELECT * FROM view_all_draws LIMIT 1;
            """
        ]

        for sql in stmts:
            try:
                self.execute(sql)
            except Exception as e:
                logger.error(f"Schema init error:\n{sql}\n→ {e}")

        # Ensure an anonymous user exists
        self.execute("""
            INSERT INTO users (id, username, email)
            VALUES (1, 'anonymous', 'anonymous@example.com')
            ON CONFLICT (id) DO NOTHING;
        """)
        self.execute("""
            INSERT INTO user_stats (user_id)
            VALUES (1)
            ON CONFLICT (user_id) DO NOTHING;
        """)

    # ----------------------------------------
    # CRUD & helpers
    # ----------------------------------------

    def get_draws(self, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        rows = self.execute(
            """
            SELECT * 
              FROM view_all_draws
             LIMIT %s OFFSET %s
            """,
            (limit, offset)
        )
        return rows or []

    def get_draw_by_number(self, draw_number: int) -> Optional[Dict[str, Any]]:
        rows = self.execute(
            "SELECT * FROM draws WHERE draw_number = %s",
            (draw_number,)
        )
        return rows[0] if rows else None

    def get_draw_by_date(self, draw_date: str) -> Optional[Dict[str, Any]]:
        rows = self.execute(
            "SELECT * FROM draws WHERE draw_date = %s",
            (draw_date,)
        )
        return rows[0] if rows else None

    def get_latest_draw(self) -> Optional[Dict[str, Any]]:
        rows = self.execute("SELECT * FROM view_latest_draw")
        return rows[0] if rows else None

    def add_draw(
        self,
        draw_number: int,
        draw_date: str,
        white_balls: List[int],
        powerball: int,
        jackpot_amount: float = 0,
        winners: int = 0,
        source: str = "api"
    ) -> Optional[Dict[str, Any]]:
        # Skip if already exists
        if self.get_draw_by_number(draw_number):
            logger.info(f"Draw {draw_number} exists, skipping")
            return None

        # Insert into draws
        inserted = self.execute(
            """
            INSERT INTO draws
              (draw_number, draw_date, white_balls, powerball, jackpot_amount, winners, source)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id, draw_number, draw_date, white_balls, powerball, jackpot_amount, winners, source, created_at
            """,
            (draw_number, draw_date, white_balls, powerball, jackpot_amount, winners, source)
        )
        if not inserted:
            logger.error(f"Failed to insert draw {draw_number}")
            return None
        draw = inserted[0]

        # Insert into numbers
        with self.cursor() as cur:
            for idx, num in enumerate(white_balls, start=1):
                cur.execute(
                    "INSERT INTO numbers (draw_id, position, number, is_powerball) VALUES (%s, %s, %s, FALSE)",
                    (draw["id"], idx, num)
                )
            cur.execute(
                "INSERT INTO numbers (draw_id, position, number, is_powerball) VALUES (%s, 6, %s, TRUE)",
                (draw["id"], powerball)
            )
        return draw

    def add_user_check(
        self,
        user_id: int,
        draw_id: int,
        numbers: List[int],
        white_matches: List[int],
        powerball_match: bool,
        is_winner: bool,
        prize: str
    ) -> Optional[Dict[str, Any]]:
        rows = self.execute(
            """
            INSERT INTO user_checks
              (user_id, draw_id, white_matches, powerball_match, is_winner, prize)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (user_id, draw_id, white_matches, powerball_match, is_winner, prize)
        )
        return rows[0] if rows else None

    def update_user_stat(self, user_id: int, field: str) -> None:
        # e.g. field = 'draws_added' or 'checks_performed'
        self.execute(f"""
            UPDATE user_stats
               SET {field} = {field} + 1,
                   updated_at = NOW()
             WHERE user_id = %s
        """, (user_id,))

# Singleton & helper
_db = PostgresDB()
def get_db() -> PostgresDB:
    return _db

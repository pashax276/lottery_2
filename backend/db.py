import os
import logging
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import time
from contextlib import contextmanager
from typing import List, Dict, Any, Optional, Tuple
from passlib.context import CryptContext
import json

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
        self.db_url = db_url or os.environ.get("DATABASE_URL", "postgresql://powerball:powerball@db:5432/powerball")
        self.max_retries = max_retries
        self.retry_interval = retry_interval
        self.conn = None
        logger.info("Database connector initialized")

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
        try:
            with self.cursor() as cur:
                cur.execute(query, params)
                if cur.description:
                    return cur.fetchall()
        except Exception as e:
            logger.error(f"Query execution error: {e}")
            logger.error(f"Query: {query}")
            logger.error(f"Params: {params}")
            raise
        return None

    def init_schema(self) -> None:
        """Create all tables, indexes, and views if they don't exist."""
        stmts = [
            # 1. USERS
            """
            CREATE TABLE IF NOT EXISTS users (
              id SERIAL PRIMARY KEY,
              username VARCHAR(100) UNIQUE NOT NULL,
              email VARCHAR(255) UNIQUE,
              password_hash TEXT,
              is_admin BOOLEAN DEFAULT FALSE,
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
              numbers INTEGER[] NOT NULL,
              white_matches INTEGER[] DEFAULT '{}',
              powerball_match BOOLEAN DEFAULT FALSE,
              is_winner BOOLEAN DEFAULT FALSE,
              prize VARCHAR(100),
              prize_amount NUMERIC(15,2) DEFAULT 0,
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
            "CREATE INDEX IF NOT EXISTS idx_draws_date ON draws(draw_date);",
            "CREATE INDEX IF NOT EXISTS idx_numbers_draw ON numbers(draw_id);",
            "CREATE INDEX IF NOT EXISTS idx_numbers_num ON numbers(number);",
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

        # Create users
        self._ensure_users()

    def _ensure_users(self):
        """Ensure both anonymous and admin users exist"""
        try:
            # First, check if anonymous user exists
            anon_result = self.execute("SELECT id FROM users WHERE username = 'anonymous'")
            
            if not anon_result:
                # Create anonymous user
                self.execute("""
                    INSERT INTO users (username, email, is_admin)
                    VALUES ('anonymous', 'anonymous@example.com', FALSE)
                    ON CONFLICT (username) DO NOTHING
                    RETURNING id
                """)
                logger.info("Created anonymous user")
            else:
                logger.info(f"Anonymous user already exists with ID {anon_result[0]['id']}")
            
            # Get the anonymous user ID
            anon_result = self.execute("SELECT id FROM users WHERE username = 'anonymous'")
            if anon_result:
                anon_id = anon_result[0]['id']
                
                # Ensure user stats for anonymous user
                self.execute("""
                    INSERT INTO user_stats (user_id)
                    VALUES (%s)
                    ON CONFLICT (user_id) DO NOTHING
                """, (anon_id,))
                logger.info(f"Ensured user stats for anonymous user (ID: {anon_id})")
            
            # Now handle admin user
            admin_username = os.environ.get("ADMIN_USERNAME", "admin")
            admin_password = os.environ.get("ADMIN_PASSWORD", "powerball_admin")
            admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com")
            
            # Check if admin exists
            admin_result = self.execute(
                "SELECT id, password_hash FROM users WHERE username = %s",
                (admin_username,)
            )
            
            if not admin_result:
                # Create admin user
                logger.info(f"Creating admin user: {admin_username}")
                hashed_password = pwd_context.hash(admin_password)
                
                result = self.execute("""
                    INSERT INTO users (username, email, password_hash, is_admin)
                    VALUES (%s, %s, %s, TRUE)
                    ON CONFLICT (username) DO NOTHING
                    RETURNING id
                """, (admin_username, admin_email, hashed_password))
                
                if result:
                    admin_id = result[0]['id']
                    logger.info(f"Created admin user with ID: {admin_id}")
                    
                    # Create user stats for admin
                    self.execute("""
                        INSERT INTO user_stats (user_id)
                        VALUES (%s)
                        ON CONFLICT (user_id) DO NOTHING
                    """, (admin_id,))
                    logger.info("Created user stats for admin")
            else:
                admin_id = admin_result[0]['id']
                password_hash = admin_result[0]['password_hash']
                
                if not password_hash:
                    # Update password if missing
                    logger.info(f"Admin user exists but has no password, updating...")
                    hashed_password = pwd_context.hash(admin_password)
                    self.execute("""
                        UPDATE users 
                        SET password_hash = %s, is_admin = TRUE
                        WHERE id = %s
                    """, (hashed_password, admin_id))
                    logger.info(f"Updated admin password and is_admin")
                else:
                    # Ensure is_admin is set
                    self.execute("""
                        UPDATE users 
                        SET is_admin = TRUE
                        WHERE id = %s AND is_admin = FALSE
                    """, (admin_id,))
                    logger.info(f"Admin user '{admin_username}' already exists with ID {admin_id}")
                
        except Exception as e:
            logger.error(f"Error ensuring users: {e}")

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
        prize: str,
        prize_amount: float = 0
    ) -> Optional[Dict[str, Any]]:
        rows = self.execute(
            """
            INSERT INTO user_checks
              (user_id, draw_id, numbers, white_matches, powerball_match, is_winner, prize, prize_amount)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (user_id, draw_id, numbers, white_matches, powerball_match, is_winner, prize, prize_amount)
        )
        if rows and is_winner:
            self.update_user_stat(user_id, 'wins')
        if rows:
            self.update_user_stat(user_id, 'checks_performed')
        return rows[0] if rows else None

    def update_user_stat(self, user_id: int, field: str) -> None:
        valid_fields = ['draws_added', 'predictions_made', 'analysis_runs', 'checks_performed', 'wins']
        if field not in valid_fields:
            logger.error(f"Invalid user stat field: {field}")
            return
            
        query = f"""
            INSERT INTO user_stats (user_id, {field}, updated_at)
            VALUES (%s, 1, NOW())
            ON CONFLICT (user_id) DO UPDATE 
            SET {field} = user_stats.{field} + 1,
                updated_at = NOW()
        """
        self.execute(query, (user_id,))

    def get_user_stats(self, user_id: int) -> Dict[str, Any]:
        """Get or create user stats"""
        rows = self.execute(
            "SELECT * FROM user_stats WHERE user_id = %s",
            (user_id,)
        )
        
        if rows:
            return rows[0]
        
        # Create if doesn't exist
        self.execute(
            """
            INSERT INTO user_stats 
              (user_id, draws_added, predictions_made, analysis_runs, checks_performed, wins)
            VALUES (%s, 0, 0, 0, 0, 0)
            ON CONFLICT (user_id) DO NOTHING
            RETURNING *
            """,
            (user_id,)
        )
        
        rows = self.execute(
            "SELECT * FROM user_stats WHERE user_id = %s",
            (user_id,)
        )
        
        return rows[0] if rows else {}

    def get_frequency_analysis(self) -> Dict[str, Any]:
        """Get frequency analysis for all numbers"""
        result = {
            'white_balls': {},
            'powerballs': {}
        }
        
        # Analyze white balls
        query = """
        SELECT number, COUNT(*) as frequency
        FROM numbers
        WHERE is_powerball = FALSE
        GROUP BY number
        ORDER BY number
        """
        rows = self.execute(query)
        
        if rows:
            for row in rows:
                result['white_balls'][str(row['number'])] = row['frequency']
        
        # Analyze powerballs
        query = """
        SELECT number, COUNT(*) as frequency
        FROM numbers
        WHERE is_powerball = TRUE
        GROUP BY number
        ORDER BY number
        """
        rows = self.execute(query)
        
        if rows:
            for row in rows:
                result['powerballs'][str(row['number'])] = row['frequency']
        
        # Fill missing numbers with zero frequency
        for i in range(1, 70):
            if str(i) not in result['white_balls']:
                result['white_balls'][str(i)] = 0
        
        for i in range(1, 27):
            if str(i) not in result['powerballs']:
                result['powerballs'][str(i)] = 0
        
        return result

    def add_prediction(
        self,
        white_balls: List[int],
        powerball: int,
        method: str,
        confidence: float,
        rationale: str = None,
        user_id: int = None
    ) -> Optional[Dict[str, Any]]:
        """Add a new prediction"""
        # Insert prediction
        rows = self.execute(
            """
            INSERT INTO predictions (user_id, method, confidence, rationale)
            VALUES (%s, %s, %s, %s)
            RETURNING *
            """,
            (user_id, method, confidence, rationale)
        )
        
        if not rows:
            return None
        
        prediction = rows[0]
        
        # Insert prediction numbers
        with self.cursor() as cur:
            # White balls
            for i, number in enumerate(white_balls, start=1):
                cur.execute(
                    """
                    INSERT INTO prediction_numbers 
                      (prediction_id, position, number, is_powerball)
                    VALUES (%s, %s, %s, FALSE)
                    """,
                    (prediction['id'], i, number)
                )
            
            # Powerball
            cur.execute(
                """
                INSERT INTO prediction_numbers 
                  (prediction_id, position, number, is_powerball)
                VALUES (%s, 6, %s, TRUE)
                """,
                (prediction['id'], powerball)
            )
        
        # Update user stats if user_id provided
        if user_id and user_id > 0:
            self.update_user_stat(user_id, 'predictions_made')
        
        return prediction

    def get_predictions(
        self,
        method: Optional[str] = None,
        user_id: Optional[int] = None,
        limit: int = 10,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """Get predictions, optionally filtered"""
        where_clauses = []
        params = []
        
        if method:
            where_clauses.append("p.method = %s")
            params.append(method)
        
        if user_id is not None:
            where_clauses.append("p.user_id = %s")
            params.append(user_id)
        
        where_clause = ""
        if where_clauses:
            where_clause = "WHERE " + " AND ".join(where_clauses)
        
        query = f"""
        SELECT 
          p.id,
          p.user_id,
          p.method,
          p.confidence,
          p.rationale,
          p.created_at,
          array_agg(CASE WHEN pn.is_powerball = FALSE THEN pn.number END ORDER BY pn.position) FILTER (WHERE pn.is_powerball = FALSE) AS white_balls,
          (array_agg(pn.number) FILTER (WHERE pn.is_powerball = TRUE))[1] AS powerball
        FROM predictions p
        JOIN prediction_numbers pn ON p.id = pn.prediction_id
        {where_clause}
        GROUP BY p.id
        ORDER BY p.created_at DESC
        LIMIT %s OFFSET %s
        """
        
        params.extend([limit, offset])
        rows = self.execute(query, tuple(params))
        
        return rows or []

    def get_user_checks(self, user_id: int, limit: int = 10, offset: int = 0) -> List[Dict[str, Any]]:
        """Get user check history"""
        query = """
        SELECT 
          uc.*,
          d.draw_number,
          d.draw_date,
          d.white_balls,
          d.powerball,
          d.jackpot_amount
        FROM user_checks uc
        JOIN draws d ON uc.draw_id = d.id
        WHERE uc.user_id = %s
        ORDER BY uc.created_at DESC
        LIMIT %s OFFSET %s
        """
        
        rows = self.execute(query, (user_id, limit, offset))
        return rows or []

    def save_analysis_result(self, analysis_type: str, result_data: Dict[str, Any], parameters: Dict[str, Any] = None) -> None:
        """Save analysis results"""
        query = """
        INSERT INTO analysis_results (type, parameters, result_data)
        VALUES (%s, %s::jsonb, %s::jsonb)
        """
        
        self.execute(
            query,
            (
                analysis_type,
                json.dumps(parameters) if parameters else None,
                json.dumps(result_data)
            )
        )

    def get_analysis_results(self, analysis_type: str, limit: int = 1) -> List[Dict[str, Any]]:
        """Get recent analysis results"""
        query = """
        SELECT * FROM analysis_results
        WHERE type = %s
        ORDER BY created_at DESC
        LIMIT %s
        """
        
        rows = self.execute(query, (analysis_type, limit))
        return rows or []

    def get_expected_combinations(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get expected combinations"""
        query = """
        SELECT * FROM expected_combinations
        ORDER BY score DESC, created_at DESC
        LIMIT %s
        """
        
        rows = self.execute(query, (limit,))
        return rows or []

    def add_expected_combination(
        self,
        white_balls: List[int],
        powerball: int,
        score: float,
        method: str,
        reason: str = None
    ) -> None:
        """Add an expected combination"""
        query = """
        INSERT INTO expected_combinations (score, method, reason)
        VALUES (%s, %s, %s)
        """
        
        self.execute(query, (score, method, reason))

    def clear_expected_combinations(self) -> None:
        """Clear all expected combinations"""
        self.execute("TRUNCATE TABLE expected_combinations")

    def get_all_users(self) -> List[Dict[str, Any]]:
        """Get all users for admin selection"""
        query = """
        SELECT id, username
        FROM users
        ORDER BY username
        """
        rows = self.execute(query)
        return rows or []

# Singleton & helper
_db = PostgresDB()
def get_db() -> PostgresDB:
    return _db
# Initialize schema
_db.init_schema()
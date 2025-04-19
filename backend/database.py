import os
import logging
import psycopg2
from psycopg2.extras import RealDictCursor
import time
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime

logger = logging.getLogger("powerball-analyzer-db")

class DatabaseConnector:
    def __init__(self, db_url: Optional[str] = None, max_retries: int = 15, retry_interval: int = 10):
        self.db_url = db_url or os.environ.get('DATABASE_URL', 'postgresql://powerball:powerball@db:5432/powerball')
        self.max_retries = max_retries
        self.retry_interval = retry_interval
        self.conn = None
        
        logger.info(f"Database connector initialized with URL: {self.db_url}")
    
    def _parse_connection_params(self) -> Dict[str, str]:
        params_str = self.db_url.replace('postgresql://', '')
        auth_host_db = params_str.split('@')
        if len(auth_host_db) != 2:
            raise ValueError("Invalid database URL format")
        
        auth = auth_host_db[0].split(':')
        host_db = auth_host_db[1].split('/')
        
        if len(auth) != 2 or len(host_db) != 2:
            raise ValueError("Invalid database URL format")
        
        user, password = auth
        host_port = host_db[0].split(':')
        dbname = host_db[1]
        
        if len(host_port) == 1:
            host, port = host_port[0], '5432'
        elif len(host_port) == 2:
            host, port = host_port
        else:
            raise ValueError("Invalid host:port format in database URL")
        
        return {
            'dbname': dbname,
            'user': user,
            'password': password,
            'host': host,
            'port': port
        }
    
    def connect(self) -> bool:
        for attempt in range(1, self.max_retries + 1):
            try:
                if self.conn is not None and not self.conn.closed:
                    logger.debug("Already connected to the database")
                    return True
                
                logger.info(f"Connecting to database at {self.db_url} (attempt {attempt}/{self.max_retries})...")
                
                conn_params = self._parse_connection_params()
                logger.debug(f"Connection parameters: {conn_params}")
                
                self.conn = psycopg2.connect(
                    **conn_params,
                    cursor_factory=RealDictCursor,
                    keepalives=1,
                    keepalives_idle=30,
                    keepalives_interval=10,
                    keepalives_count=5
                )
                self.conn.autocommit = True
                
                logger.info("Successfully connected to the database")
                return True
            
            except Exception as e:
                logger.error(f"Error connecting to database: {str(e)}")
                
                if attempt < self.max_retries:
                    logger.info(f"Retrying in {self.retry_interval} seconds...")
                    time.sleep(self.retry_interval)
                else:
                    logger.error("Maximum connection retries reached. Giving up.")
                    return False
            for attempt in range(1, self.max_retries + 1):
                try:
                    if self.conn is not None and not self.conn.closed:
                        logger.debug("Already connected to the database")
                        return True
                    
                    logger.info(f"Connecting to database at {self.db_url} (attempt {attempt}/{self.max_retries})...")
                    
                    conn_params = self._parse_connection_params()
                    logger.debug(f"Connection parameters: {conn_params}")
                    
                    self.conn = psycopg2.connect(
                        **conn_params,
                        cursor_factory=RealDictCursor,
                        keepalives=1,
                        keepalives_idle=30,
                        keepalives_interval=10,
                        keepalives_count=5
                    )
                    self.conn.autocommit = True
                    
                    logger.info("Successfully connected to the database")
                    return True
                
                except Exception as e:
                    logger.error(f"Error connecting to database: {str(e)}")
                    
                    if attempt < self.max_retries:
                        logger.info(f"Retrying in {self.retry_interval} seconds...")
                        time.sleep(self.retry_interval)
                    else:
                        logger.error("Maximum connection retries reached. Giving up.")
                        return False
                for attempt in range(1, self.max_retries + 1):
                    try:
                        if self.conn is not None and not self.conn.closed:
                            logger.debug("Already connected to the database")
                            return True
                        
                        logger.info(f"Connecting to database (attempt {attempt}/{self.max_retries})...")
                        
                        conn_params = self._parse_connection_params()
                        
                        self.conn = psycopg2.connect(
                            **conn_params,
                            cursor_factory=RealDictCursor,
                            keepalives=1,
                            keepalives_idle=30,
                            keepalives_interval=10,
                            keepalives_count=5
                        )
                        self.conn.autocommit = True
                        
                        logger.info("Successfully connected to the database")
                        return True
                    
                    except Exception as e:
                        logger.error(f"Error connecting to database: {str(e)}")
                        
                        if attempt < self.max_retries:
                            logger.info(f"Retrying in {self.retry_interval} seconds...")
                            time.sleep(self.retry_interval)
                        else:
                            logger.error("Maximum connection retries reached. Giving up.")
                            return False
    
    def close(self) -> None:
        if self.conn is not None and not self.conn.closed:
            self.conn.close()
            logger.info("Database connection closed")
    
    def execute(self, query: str, params: tuple = None) -> Optional[List[Dict[str, Any]]]:
        if not self.connect():
            logger.error("Cannot execute query: No database connection")
            return None
        
        try:
            with self.conn.cursor() as cursor:
                logger.debug(f"Executing query: {query} with params: {params}")
                cursor.execute(query, params)
                
                if cursor.description is not None:
                    results = list(cursor.fetchall())
                    logger.debug(f"Query returned {len(results)} rows: {results}")
                    return results
                
                logger.debug("Query executed successfully (no results)")
                return None
            
        except Exception as e:
            logger.error(f"Error executing query: {str(e)}")
            logger.error(f"Query: {query}")
            logger.error(f"Params: {params}")
            raise  # Re-raise to ensure callers handle the error
    
    def init_schema(self) -> bool:
        schema_queries = [
            """
            CREATE TABLE IF NOT EXISTS draws (
                id SERIAL PRIMARY KEY,
                draw_number INTEGER UNIQUE NOT NULL,
                draw_date DATE NOT NULL,
                white_balls INTEGER[] NOT NULL,
                powerball INTEGER NOT NULL,
                jackpot_amount NUMERIC DEFAULT 0,
                winners INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                CONSTRAINT valid_white_balls CHECK (array_length(white_balls, 1) = 5),
                CONSTRAINT valid_powerball CHECK (powerball >= 1 AND powerball <= 26)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS numbers (
                id SERIAL PRIMARY KEY,
                draw_id INTEGER REFERENCES draws(id) ON DELETE CASCADE,
                position INTEGER NOT NULL,
                number INTEGER NOT NULL,
                is_powerball BOOLEAN DEFAULT FALSE,
                CONSTRAINT valid_position CHECK (position >= 1 AND position <= 6)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS predictions (
                id SERIAL PRIMARY KEY,
                white_balls INTEGER[] NOT NULL,
                powerball INTEGER NOT NULL,
                confidence NUMERIC NOT NULL,
                method VARCHAR(50) NOT NULL,
                rationale TEXT,
                user_id VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                CONSTRAINT valid_white_balls CHECK (array_length(white_balls, 1) = 5),
                CONSTRAINT valid_powerball CHECK (powerball >= 1 AND powerball <= 26)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS expected_combinations (
                id SERIAL PRIMARY KEY,
                white_balls INTEGER[] NOT NULL,
                powerball INTEGER NOT NULL,
                score NUMERIC NOT NULL,
                method VARCHAR(50) NOT NULL,
                reason TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                CONSTRAINT valid_white_balls CHECK (array_length(white_balls, 1) = 5),
                CONSTRAINT valid_powerball CHECK (powerball >= 1 AND powerball <= 26)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS user_checks (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                draw_id INTEGER REFERENCES draws(id) ON DELETE CASCADE,
                numbers INTEGER[] NOT NULL,
                white_matches INTEGER[] DEFAULT '{}',
                powerball_match BOOLEAN DEFAULT FALSE,
                is_winner BOOLEAN DEFAULT FALSE,
                prize VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                CONSTRAINT valid_numbers CHECK (array_length(numbers, 1) = 6)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS user_stats (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) UNIQUE NOT NULL,
                draws_added INTEGER DEFAULT 0,
                predictions_made INTEGER DEFAULT 0,
                analysis_runs INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
            """
        ]
        
        index_queries = [
            "CREATE INDEX IF NOT EXISTS idx_draws_draw_number ON draws(draw_number)",
            "CREATE INDEX IF NOT EXISTS idx_draws_draw_date ON draws(draw_date)",
            "CREATE INDEX IF NOT EXISTS idx_numbers_draw_id ON numbers(draw_id)",
            "CREATE INDEX IF NOT EXISTS idx_numbers_number ON numbers(number)",
            "CREATE INDEX IF NOT EXISTS idx_predictions_method ON predictions(method)",
            "CREATE INDEX IF NOT EXISTS idx_predictions_user_id ON predictions(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_user_checks_user_id ON user_checks(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_user_checks_draw_id ON user_checks(draw_id)"
        ]
        
        try:
            for query in schema_queries + index_queries:
                logger.debug(f"Executing schema query: {query}")
                self.execute(query)
            
            logger.info("Database schema initialized successfully")
            return True
        
        except Exception as e:
            logger.error(f"Error initializing database schema: {str(e)}")
            return False

    def get_draws(self, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        query = """
        SELECT * FROM draws 
        ORDER BY draw_number DESC 
        LIMIT %s OFFSET %s
        """
        logger.debug(f"Fetching draws with limit={limit}, offset={offset}")
        return self.execute(query, (limit, offset)) or []
    
    def get_draw_by_number(self, draw_number: int) -> Optional[Dict[str, Any]]:
        query = "SELECT * FROM draws WHERE draw_number = %s"
        logger.debug(f"Fetching draw number {draw_number}")
        try:
            result = self.execute(query, (draw_number,))
            return result[0] if result else None
        except Exception as e:
            logger.error(f"Error fetching draw #{draw_number}: {str(e)}")
            return None
    
    def get_draw_by_date(self, draw_date: str) -> Optional[Dict[str, Any]]:
        query = "SELECT * FROM draws WHERE draw_date = %s"
        logger.debug(f"Fetching draw by date {draw_date}")
        try:
            result = self.execute(query, (draw_date,))
            return result[0] if result else None
        except Exception as e:
            logger.error(f"Error fetching draw by date {draw_date}: {str(e)}")
            return None
    
    def get_latest_draw(self) -> Optional[Dict[str, Any]]:
        query = "SELECT * FROM draws ORDER BY draw_number DESC LIMIT 1"
        logger.debug("Fetching latest draw")
        try:
            result = self.execute(query)
            return result[0] if result else None
        except Exception as e:
            logger.error(f"Error fetching latest draw: {str(e)}")
            return None
    
    def add_draw(self, draw_number: int, draw_date: str, white_balls: List[int], 
                 powerball: int, jackpot_amount: float = 0, winners: int = 0) -> Optional[Dict[str, Any]]:
        logger.info(f"Attempting to add draw #{draw_number} with white_balls={white_balls}, powerball={powerball}, date={draw_date}, jackpot_amount={jackpot_amount}, winners={winners}")
        
        # Input validation
        if not isinstance(draw_number, int) or draw_number <= 0:
            logger.error(f"Invalid draw_number: {draw_number}")
            return None
        
        if not draw_date or not draw_date.strip():
            logger.error("Draw date is empty")
            return None
        
        try:
            datetime.strptime(draw_date, '%Y-%m-%d')
        except ValueError:
            logger.error(f"Invalid draw_date format: {draw_date} (expected YYYY-MM-DD)")
            return None
        
        if len(white_balls) != 5:
            logger.error(f"Invalid white balls count: {len(white_balls)} (expected 5)")
            return None
        
        if any(not isinstance(x, int) or x < 1 or x > 69 for x in white_balls):
            logger.error(f"Invalid white balls values: {white_balls}")
            return None
        
        if len(set(white_balls)) != 5:
            logger.error(f"Duplicate white balls: {white_balls}")
            return None
        
        if not isinstance(powerball, int) or powerball < 1 or powerball > 26:
            logger.error(f"Invalid powerball: {powerball}")
            return None
        
        # Check if draw already exists
        existing_draw = self.get_draw_by_number(draw_number)
        if existing_draw:
            logger.warning(f"Draw #{draw_number} already exists")
            return None
        
        try:
            # Disable autocommit for transaction
            self.conn.autocommit = False
            with self.conn.cursor() as cursor:
                # Insert draw
                query = """
                INSERT INTO draws 
                (draw_number, draw_date, white_balls, powerball, jackpot_amount, winners) 
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING *
                """
                logger.debug(f"Inserting draw #{draw_number} into draws table")
                try:
                    cursor.execute(query, (
                        draw_number, draw_date, white_balls, powerball, jackpot_amount, winners
                    ))
                except Exception as e:
                    logger.error(f"Failed to insert draw #{draw_number} into draws table: {str(e)}")
                    self.conn.rollback()
                    return None
                
                result = cursor.fetchall()
                if not result:
                    logger.error(f"Failed to insert draw #{draw_number}: No rows returned")
                    self.conn.rollback()
                    return None
                
                draw = result[0]
                logger.debug(f"Inserted draw #{draw_number} with id={draw['id']}")
                
                # Insert individual numbers
                for i, num in enumerate(white_balls):
                    num_query = """
                    INSERT INTO numbers (draw_id, position, number, is_powerball) 
                    VALUES (%s, %s, %s, %s)
                    """
                    logger.debug(f"Inserting white ball {num} at position {i+1} for draw #{draw_number}")
                    try:
                        cursor.execute(num_query, (draw["id"], i+1, num, False))
                    except Exception as e:
                        logger.error(f"Failed to insert white ball {num} at position {i+1} for draw #{draw_number}: {str(e)}")
                        self.conn.rollback()
                        return None
                
                # Insert powerball
                pb_query = """
                INSERT INTO numbers (draw_id, position, number, is_powerball) 
                VALUES (%s, %s, %s, %s)
                """
                logger.debug(f"Inserting powerball {powerball} for draw #{draw_number}")
                try:
                    cursor.execute(pb_query, (draw["id"], 6, powerball, True))
                except Exception as e:
                    logger.error(f"Failed to insert powerball {powerball} for draw #{draw_number}: {str(e)}")
                    self.conn.rollback()
                    return None
                
                # Commit transaction
                self.conn.commit()
                logger.info(f"Successfully added draw #{draw_number}")
                return draw
                
        except Exception as e:
            logger.error(f"Unexpected exception while adding draw #{draw_number}: {str(e)}")
            self.conn.rollback()
            return None
        
        finally:
            self.conn.autocommit = True
    
    def add_prediction(self, white_balls: List[int], powerball: int, 
                      confidence: float, method: str, rationale: str, 
                      user_id: str = "anonymous") -> Optional[Dict[str, Any]]:
        logger.debug(f"Adding prediction with white_balls={white_balls}, powerball={powerball}, method={method}")
        query = """
        INSERT INTO predictions 
        (white_balls, powerball, confidence, method, rationale, user_id) 
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING *
        """
        try:
            result = self.execute(query, (
                white_balls, powerball, confidence, method, rationale, user_id
            ))
            if result:
                self.update_user_stat(user_id, "predictions_made")
            return result[0] if result else None
        except Exception as e:
            logger.error(f"Error adding prediction: {str(e)}")
            return None
    
    def get_predictions(self, method: str = None, user_id: str = None, 
                       limit: int = 10, offset: int = 0) -> List[Dict[str, Any]]:
        query = "SELECT * FROM predictions WHERE 1=1"
        params = []
        
        if method and method.lower() != "all":
            query += " AND method = %s"
            params.append(method)
        
        if user_id:
            query += " AND user_id = %s"
            params.append(user_id)
        
        query += " ORDER BY created_at DESC LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        
        logger.debug(f"Fetching predictions with method={method}, user_id={user_id}, limit={limit}, offset={offset}")
        try:
            return self.execute(query, tuple(params)) or []
        except Exception as e:
            logger.error(f"Error fetching predictions: {str(e)}")
            return []
    
    def add_expected_combination(self, white_balls: List[int], powerball: int, 
                               score: float, method: str, reason: str) -> Optional[Dict[str, Any]]:
        logger.debug(f"Adding expected combination with white_balls={white_balls}, powerball={powerball}")
        query = """
        INSERT INTO expected_combinations 
        (white_balls, powerball, score, method, reason) 
        VALUES (%s, %s, %s, %s, %s)
        RETURNING *
        """
        try:
            result = self.execute(query, (
                white_balls, powerball, score, method, reason
            ))
            return result[0] if result else None
        except Exception as e:
            logger.error(f"Error adding expected combination: {str(e)}")
            return None
    
    def get_expected_combinations(self, limit: int = 10, offset: int = 0) -> List[Dict[str, Any]]:
        query = """
        SELECT * FROM expected_combinations 
        ORDER BY score DESC 
        LIMIT %s OFFSET %s
        """
        logger.debug(f"Fetching expected combinations with limit={limit}, offset={offset}")
        try:
            return self.execute(query, (limit, offset)) or []
        except Exception as e:
            logger.error(f"Error fetching expected combinations: {str(e)}")
            return []
    
    def clear_expected_combinations(self) -> bool:
        query = "DELETE FROM expected_combinations"
        logger.debug("Clearing expected combinations")
        try:
            self.execute(query)
            return True
        except Exception as e:
            logger.error(f"Error clearing expected combinations: {str(e)}")
            return False
    
    def add_user_check(self, user_id: str, draw_id: int, numbers: List[int], 
                      white_matches: List[int], powerball_match: bool, 
                      is_winner: bool, prize: str) -> Optional[Dict[str, Any]]:
        logger.debug(f"Adding user check for user_id={user_id}, draw_id={draw_id}")
        query = """
        INSERT INTO user_checks 
        (user_id, draw_id, numbers, white_matches, powerball_match, is_winner, prize) 
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING *
        """
        try:
            result = self.execute(query, (
                user_id, draw_id, numbers, white_matches, powerball_match, is_winner, prize
            ))
            if result:
                self.update_user_stat(user_id, "analysis_runs")
            return result[0] if result else None
        except Exception as e:
            logger.error(f"Error adding user check: {str(e)}")
            return None
    
    def get_user_checks(self, user_id: str, limit: int = 10, offset: int = 0) -> List[Dict[str, Any]]:
        query = """
        SELECT uc.*, d.draw_number, d.draw_date, d.white_balls as draw_white_balls, d.powerball as draw_powerball
        FROM user_checks uc
        JOIN draws d ON uc.draw_id = d.id
        WHERE uc.user_id = %s
        ORDER BY uc.created_at DESC
        LIMIT %s OFFSET %s
        """
        logger.debug(f"Fetching user checks for user_id={user_id}, limit={limit}, offset={offset}")
        try:
            return self.execute(query, (user_id, limit, offset)) or []
        except Exception as e:
            logger.error(f"Error fetching user checks: {str(e)}")
            return []
    
    def get_user_stats(self, user_id: str) -> Dict[str, Any]:
        query = "SELECT * FROM user_stats WHERE user_id = %s"
        logger.debug(f"Fetching user stats for user_id={user_id}")
        try:
            result = self.execute(query, (user_id,))
            if not result:
                query = """
                INSERT INTO user_stats (user_id) VALUES (%s) 
                RETURNING *
                """
                result = self.execute(query, (user_id,))
            return result[0] if result else {
                "user_id": user_id,
                "draws_added": 0,
                "predictions_made": 0,
                "analysis_runs": 0
            }
        except Exception as e:
            logger.error(f"Error fetching user stats: {str(e)}")
            return {
                "user_id": user_id,
                "draws_added": 0,
                "predictions_made": 0,
                "analysis_runs": 0
            }
    
    def update_user_stat(self, user_id: str, field: str) -> Optional[Dict[str, Any]]:
        valid_fields = ["draws_added", "predictions_made", "analysis_runs"]
        if field not in valid_fields:
            logger.error(f"Invalid user stat field: {field}")
            return None
        
        query = f"""
        UPDATE user_stats 
        SET {field} = {field} + 1, updated_at = NOW() 
        WHERE user_id = %s
        RETURNING *
        """
        logger.debug(f"Updating user stat {field} for user_id={user_id}")
        try:
            result = self.execute(query, (user_id,))
            return result[0] if result else None
        except Exception as e:
            logger.error(f"Error updating user stat {field}: {str(e)}")
            return None
    
    def get_frequency_analysis(self) -> Dict[str, Dict[str, int]]:
        logger.debug("Fetching frequency analysis")
        white_query = """
        SELECT number, COUNT(*) as count
        FROM numbers
        WHERE is_powerball = FALSE
        GROUP BY number
        ORDER BY number
        """
        
        powerball_query = """
        SELECT number, COUNT(*) as count
        FROM numbers
        WHERE is_powerball = TRUE
        GROUP BY number
        ORDER BY number
        """
        
        try:
            white_results = self.execute(white_query) or []
            powerball_results = self.execute(powerball_query) or []
            
            white_freq = {str(i): 0 for i in range(1, 70)}
            pb_freq = {str(i): 0 for i in range(1, 27)}
            
            for row in white_results:
                white_freq[str(row["number"])] = row["count"]
            
            for row in powerball_results:
                pb_freq[str(row["number"])] = row["count"]
            
            return {
                "white_balls": white_freq,
                "powerballs": pb_freq
            }
        except Exception as e:
            logger.error(f"Error fetching frequency analysis: {str(e)}")
            return {"white_balls": {}, "powerballs": {}}
    
    def get_position_analysis(self) -> List[Dict[str, Any]]:
        logger.debug("Fetching position analysis")
        query = """
        SELECT position, number, COUNT(*) as count
        FROM numbers
        WHERE is_powerball = FALSE
        GROUP BY position, number
        ORDER BY position, count DESC
        """
        try:
            results = self.execute(query) or []
            
            positions = {}
            for row in results:
                pos = row["position"]
                if pos not in positions:
                    positions[pos] = []
                
                positions[pos].append({
                    "number": row["number"],
                    "count": row["count"]
                })
            
            response = []
            for pos in sorted(positions.keys()):
                response.append({
                    "position": pos,
                    "top_numbers": positions[pos][:5]
                })
            
            return response
        except Exception as e:
            logger.error(f"Error fetching position analysis: {str(e)}")
            return []
    
    def get_pair_analysis(self) -> List[Dict[str, Any]]:
        logger.debug("Fetching pair analysis")
        query = """
        SELECT 
            LEAST(n1.number, n2.number) as num1,
            GREATEST(n1.number, n2.number) as num2,
            COUNT(*) as count
        FROM numbers n1
        JOIN numbers n2 ON n1.draw_id = n2.draw_id
        WHERE 
            n1.is_powerball = FALSE AND 
            n2.is_powerball = FALSE AND
            n1.position < n2.position
        GROUP BY num1, num2
        ORDER BY count DESC
        LIMIT 15
        """
        try:
            results = self.execute(query) or []
            return [{"pair": [row["num1"], row["num2"]], "count": row["count"]} for row in results]
        except Exception as e:
            logger.error(f"Error fetching pair analysis: {str(e)}")
            return []
    
    def get_hot_numbers(self, limit: int = 10) -> Dict[str, Dict[str, int]]:
        logger.debug(f"Fetching hot numbers with limit={limit}")
        latest_draws_query = """
        SELECT id FROM draws
        ORDER BY draw_date DESC
        LIMIT 20
        """
        try:
            latest_draws = self.execute(latest_draws_query) or []
            
            if not latest_draws:
                return {"white_balls": {}, "powerballs": {}}
            
            draw_ids = [str(draw["id"]) for draw in latest_draws]
            ids_str = ",".join(draw_ids)
            
            white_query = f"""
            SELECT number, COUNT(*) as count
            FROM numbers
            WHERE is_powerball = FALSE AND draw_id IN ({ids_str})
            GROUP BY number
            ORDER BY count DESC
            LIMIT {limit}
            """
            
            powerball_query = f"""
            SELECT number, COUNT(*) as count
            FROM numbers
            WHERE is_powerball = TRUE AND draw_id IN ({ids_str})
            GROUP BY number
            ORDER BY count DESC
            LIMIT 5
            """
            
            white_results = self.execute(white_query) or []
            powerball_results = self.execute(powerball_query) or []
            
            return {
                "white_balls": {str(row["number"]): row["count"] for row in white_results},
                "powerballs": {str(row["number"]): row["count"] for row in powerball_results}
            }
        except Exception as e:
            logger.error(f"Error fetching hot numbers: {str(e)}")
            return {"white_balls": {}, "powerballs": {}}
    
    def get_due_numbers(self, limit: int = 10) -> Dict[str, Dict[str, int]]:
        logger.debug(f"Fetching due numbers with limit={limit}")
        white_query = """
        SELECT number, MAX(d.draw_number) as last_draw
        FROM numbers n
        JOIN draws d ON n.draw_id = d.id
        WHERE n.is_powerball = FALSE
        GROUP BY number
        ORDER BY last_draw
        LIMIT %s
        """
        
        powerball_query = """
        SELECT number, MAX(d.draw_number) as last_draw
        FROM numbers n
        JOIN draws d ON n.draw_id = d.id
        WHERE n.is_powerball = TRUE
        GROUP BY number
        ORDER BY last_draw
        LIMIT 5
        """
        
        try:
            white_results = self.execute(white_query, (limit,)) or []
            powerball_results = self.execute(powerball_query) or []
            
            return {
                "white_balls": {str(row["number"]): row["last_draw"] for row in white_results},
                "powerballs": {str(row["number"]): row["last_draw"] for row in powerball_results}
            }
        except Exception as e:
            logger.error(f"Error fetching due numbers: {str(e)}")
            return {"white_balls": {}, "powerballs": {}}
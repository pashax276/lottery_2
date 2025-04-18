import os
import logging
import psycopg2
from psycopg2.extras import RealDictCursor, execute_values
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import time
from typing import List, Dict, Any, Optional, Tuple
from contextlib import contextmanager
from datetime import datetime
from passlib.context import CryptContext

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("powerball-db")

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class PostgresDB:
    """
    PostgreSQL database connector for the Powerball Analyzer
    """
    
    def __init__(self, db_url: Optional[str] = None, max_retries: int = 15, retry_interval: int = 10):
        """
        Initialize the database connector
        
        Args:
            db_url: Database connection URL (defaults to DATABASE_URL env var)
            max_retries: Maximum number of connection retries
            retry_interval: Interval between retries in seconds
        """
        self.db_url = db_url or os.environ.get('DATABASE_URL', 'postgresql://powerball:powerball@db:5432/powerball')
        self.max_retries = max_retries
        self.retry_interval = retry_interval
        self.conn = None
        
        logger.info(f"Database connector initialized")
    
    def connect(self) -> bool:
        """
        Connect to the database with retries
        
        Returns:
            bool: True if connection succeeded, False otherwise
        """
        for attempt in range(1, self.max_retries + 1):
            try:
                if self.conn is not None and not self.conn.closed:
                    return True
                
                logger.info(f"Connecting to database (attempt {attempt}/{self.max_retries})...")
                
                self.conn = psycopg2.connect(
                    self.db_url,
                    cursor_factory=RealDictCursor,
                )
                self.conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
                
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
        """Close the database connection"""
        if self.conn is not None and not self.conn.closed:
            self.conn.close()
            logger.info("Database connection closed")
    
    @contextmanager
    def cursor(self):
        """Context manager for database cursors"""
        if not self.connect():
            raise Exception("Failed to connect to the database")
        
        cursor = self.conn.cursor()
        try:
            yield cursor
        finally:
            cursor.close()
    
    def execute(self, query: str, params: Optional[tuple] = None) -> Optional[List[Dict[str, Any]]]:
        """
        Execute a query and return the results
        
        Args:
            query: SQL query to execute
            params: Query parameters
            
        Returns:
            List of dictionaries containing the query results, or None if the query fails
        """
        try:
            with self.cursor() as cursor:
                cursor.execute(query, params)
                
                # Check if the query returns results
                if cursor.description is not None:
                    return list(cursor.fetchall())
                
                return None
        
        except Exception as e:
            logger.error(f"Error executing query: {str(e)}")
            logger.error(f"Query: {query}")
            logger.error(f"Params: {params}")
            return None
    
    def execute_many(self, query: str, params_list: List[tuple]) -> bool:
        """
        Execute a query with multiple parameter sets
        
        Args:
            query: SQL query to execute
            params_list: List of parameter tuples
            
        Returns:
            bool: True if execution succeeded, False otherwise
        """
        if not params_list:
            return True
        
        try:
            with self.cursor() as cursor:
                execute_values(cursor, query, params_list)
                return True
        
        except Exception as e:
            logger.error(f"Error executing batch query: {str(e)}")
            logger.error(f"Query: {query}")
            return False
    
    def init_schema(self) -> bool:
        """
        Initialize the database schema from schema.sql
        
        Returns:
            bool: True if schema initialization succeeded, False otherwise
        """
        try:
            schema_path = os.path.join(os.path.dirname(__file__), 'schema.sql')
            
            with open(schema_path, 'r') as f:
                schema_sql = f.read()
            
            with self.cursor() as cursor:
                cursor.execute(schema_sql)
            
            # Check if admin user exists, if not create it
            self.ensure_admin_user()
            
            logger.info("Database schema initialized successfully")
            return True
        
        except Exception as e:
            logger.error(f"Error initializing database schema: {str(e)}")
            return False
    
    def ensure_admin_user(self) -> None:
        """Ensure the admin user exists in the database"""
        try:
            # Check if admin user exists
            query = "SELECT * FROM users WHERE username = 'admin'"
            result = self.execute(query)
            
            # If admin user doesn't exist, create it
            if not result:
                admin_username = os.environ.get("ADMIN_USERNAME", "admin")
                admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com")
                admin_password = os.environ.get("ADMIN_PASSWORD", "powerball_admin")
                
                # Hash the password
                hashed_password = pwd_context.hash(admin_password)
                
                # Insert admin user
                query = """
                INSERT INTO users (username, email, password_hash)
                VALUES (%s, %s, %s)
                RETURNING id, username, email
                """
                
                admin_user = self.execute(query, (admin_username, admin_email, hashed_password))
                
                if admin_user:
                    # Create user stats for admin
                    self.get_user_stats(admin_user[0]['id'])
                    logger.info("Created admin user")
        except Exception as e:
            logger.error(f"Error ensuring admin user: {str(e)}")
    
    # User authentication methods
    def authenticate_user(self, username: str, password: str) -> Optional[Dict[str, Any]]:
        """Authenticate a user by username and password"""
        try:
            # Get user
            query = "SELECT id, username, email, password_hash FROM users WHERE username = %s"
            result = self.execute(query, (username,))
            
            if not result:
                return None
            
            user = result[0]
            
            # Check if password hash exists
            if not user['password_hash']:
                return None
            
            # Verify password
            if not pwd_context.verify(password, user['password_hash']):
                return None
            
            # Return user without password hash
            return {
                'id': user['id'],
                'username': user['username'],
                'email': user['email']
            }
        
        except Exception as e:
            logger.error(f"Error authenticating user: {str(e)}")
            return None
    
    # User operations
    def create_user(self, username: str, password: str, email: str = None) -> Optional[Dict[str, Any]]:
        """Create a new user"""
        try:
            # Check if username already exists
            query = "SELECT * FROM users WHERE username = %s"
            existing_user = self.execute(query, (username,))
            
            if existing_user:
                logger.warning(f"Username '{username}' already exists")
                return None
            
            # Hash the password
            hashed_password = pwd_context.hash(password)
            
            # Insert the user
            query = """
            INSERT INTO users (username, email, password_hash)
            VALUES (%s, %s, %s)
            RETURNING id, username, email
            """
            
            result = self.execute(query, (username, email, hashed_password))
            
            if not result:
                return None
            
            user = result[0]
            
            # Create user stats
            self.get_user_stats(user['id'])
            
            return user
        
        except Exception as e:
            logger.error(f"Error creating user: {str(e)}")
            return None
    
    # Draw operations
    def get_draws(self, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        """Get draws with pagination"""
        query = """
        SELECT * FROM draws 
        ORDER BY draw_number DESC 
        LIMIT %s OFFSET %s
        """
        return self.execute(query, (limit, offset)) or []
    
    def get_draw_by_number(self, draw_number: int) -> Optional[Dict[str, Any]]:
        """Get a draw by its draw number"""
        query = "SELECT * FROM draws WHERE draw_number = %s"
        result = self.execute(query, (draw_number,))
        return result[0] if result else None
    
    def get_draw_by_date(self, draw_date: str) -> Optional[Dict[str, Any]]:
        """Get a draw by its date"""
        query = "SELECT * FROM draws WHERE draw_date = %s"
        result = self.execute(query, (draw_date,))
        return result[0] if result else None
    
    def get_latest_draw(self) -> Optional[Dict[str, Any]]:
        """Get the latest draw"""
        query = "SELECT * FROM draws ORDER BY draw_number DESC LIMIT 1"
        result = self.execute(query)
        return result[0] if result else None
    
    def add_draw(self, draw_number: int, draw_date: str, white_balls: List[int], 
                 powerball: int, jackpot_amount: float = 0, winners: int = 0,
                 source: str = 'api') -> Optional[Dict[str, Any]]:
        """Add a new draw"""
        # Check if draw already exists
        if self.get_draw_by_number(draw_number):
            logger.warning(f"Draw {draw_number} already exists")
            return None
        
        # Insert draw
        query = """
        INSERT INTO draws 
        (draw_number, draw_date, jackpot_amount, winners, source) 
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id, draw_number, draw_date, jackpot_amount, winners, source, created_at
        """
        
        result = self.execute(query, (
            draw_number, draw_date, jackpot_amount, winners, source
        ))
        
        if not result:
            return None
        
        draw = result[0]
        
        # Insert individual numbers
        number_params = []
        for i, number in enumerate(white_balls):
            number_params.append((draw["id"], i+1, number, False))
        
        # Insert powerball
        number_params.append((draw["id"], 6, powerball, True))
        
        numbers_query = """
        INSERT INTO numbers (draw_id, position, number, is_powerball)
        VALUES %s
        """
        
        self.execute_many(numbers_query, number_params)
        
        return draw
    
    # Prediction operations
    def add_prediction(self, white_balls: List[int], powerball: int, 
                      method: str, confidence: float, rationale: str, 
                      user_id: int = 1) -> Optional[Dict[str, Any]]:
        """Add a new prediction"""
        query = """
        INSERT INTO predictions 
        (user_id, method, confidence, rationale)
        VALUES (%s, %s, %s, %s)
        RETURNING id
        """
        
        result = self.execute(query, (
            user_id, method, confidence, rationale
        ))
        
        if not result:
            return None
        
        pred_id = result[0]['id']
        
        # Insert white balls
        number_params = []
        for i, number in enumerate(white_balls):
            number_params.append((pred_id, i+1, number, False))
        
        # Insert powerball
        number_params.append((pred_id, 6, powerball, True))
        
        numbers_query = """
        INSERT INTO prediction_numbers (prediction_id, position, number, is_powerball)
        VALUES %s
        """
        
        self.execute_many(numbers_query, number_params)
        
        # Update user stats
        self.update_user_stat(user_id, 'predictions_made')
        
        # Get complete prediction
        query = """
        SELECT 
            p.id, p.user_id, p.method, p.confidence, p.rationale, p.created_at,
            array_agg(CASE WHEN pn.is_powerball = false THEN pn.number END ORDER BY pn.position) FILTER (WHERE pn.is_powerball = false) AS white_balls,
            (array_agg(pn.number) FILTER (WHERE pn.is_powerball = true))[1] AS powerball
        FROM 
            predictions p
        JOIN 
            prediction_numbers pn ON p.id = pn.prediction_id
        WHERE 
            p.id = %s
        GROUP BY 
            p.id
        """
        
        result = self.execute(query, (pred_id,))
        return result[0] if result else None
    
    def get_predictions(self, method: Optional[str] = None, 
                      user_id: Optional[int] = None,
                      limit: int = 10, offset: int = 0) -> List[Dict[str, Any]]:
        """Get predictions with filtering"""
        query = """
        SELECT 
            p.id, p.user_id, p.method, p.confidence, p.rationale, p.created_at,
            array_agg(CASE WHEN pn.is_powerball = false THEN pn.number END ORDER BY pn.position) FILTER (WHERE pn.is_powerball = false) AS white_balls,
            (array_agg(pn.number) FILTER (WHERE pn.is_powerball = true))[1] AS powerball
        FROM 
            predictions p
        JOIN 
            prediction_numbers pn ON p.id = pn.prediction_id
        WHERE 1=1
        """
        
        params = []
        
        if method and method.lower() != 'all':
            query += " AND p.method = %s"
            params.append(method)
        
        if user_id:
            query += " AND p.user_id = %s"
            params.append(user_id)
        
        query += """
        GROUP BY p.id
        ORDER BY p.created_at DESC
        LIMIT %s OFFSET %s
        """
        
        params.extend([limit, offset])
        
        result = self.execute(query, tuple(params))
        return result if result else []
    
    # User stats operations
    def get_user_stats(self, user_id: int = 1) -> Dict[str, Any]:
        """Get stats for a user"""
        query = """
        SELECT * FROM user_stats WHERE user_id = %s
        """
        
        result = self.execute(query, (user_id,))
        
        if not result:
            # Create default stats for user
            insert_query = """
            INSERT INTO user_stats (user_id)
            VALUES (%s)
            RETURNING *
            """
            
            result = self.execute(insert_query, (user_id,))
        
        return result[0] if result else {
            "user_id": user_id,
            "draws_added": 0,
            "predictions_made": 0,
            "analysis_runs": 0,
            "checks_performed": 0,
            "wins": 0
        }
    
    def update_user_stat(self, user_id: int, stat: str) -> bool:
        """Increment a user stat counter"""
        valid_stats = ['draws_added', 'predictions_made', 'analysis_runs', 'checks_performed', 'wins']
        
        if stat not in valid_stats:
            logger.error(f"Invalid user stat: {stat}")
            return False
        
        query = f"""
        UPDATE user_stats 
        SET {stat} = {stat} + 1, updated_at = NOW() 
        WHERE user_id = %s
        """
        
        self.execute(query, (user_id,))
        return True
    
    # Check numbers operations
    def add_user_check(self, user_id: int, draw_id: int, numbers: List[int],
                      white_matches: List[int], powerball_match: bool,
                      is_winner: bool, prize: str) -> Optional[Dict[str, Any]]:
        """Add a user number check"""
        query = """
        INSERT INTO user_checks
        (user_id, draw_id, white_matches, powerball_match, is_winner, prize)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING *
        """
        
        result = self.execute(query, (
            user_id, draw_id, white_matches, powerball_match, is_winner, prize
        ))
        
        if result:
            # Update user stats
            self.update_user_stat(user_id, 'checks_performed')
            if is_winner:
                self.update_user_stat(user_id, 'wins')
        
        return result[0] if result else None
    
    def get_user_checks(self, user_id: int, limit: int = 10, offset: int = 0) -> List[Dict[str, Any]]:
        """Get checks for a user"""
        query = """
        SELECT 
            uc.*, 
            d.draw_number, d.draw_date,
            array_agg(CASE WHEN n.is_powerball = false THEN n.number END ORDER BY n.position) FILTER (WHERE n.is_powerball = false) AS white_balls,
            (array_agg(n.number) FILTER (WHERE n.is_powerball = true))[1] AS powerball
        FROM 
            user_checks uc
        JOIN 
            draws d ON uc.draw_id = d.id
        JOIN 
            numbers n ON d.id = n.draw_id
        WHERE 
            uc.user_id = %s
        GROUP BY 
            uc.id, d.draw_number, d.draw_date
        ORDER BY 
            uc.created_at DESC
        LIMIT %s OFFSET %s
        """
        
        result = self.execute(query, (user_id, limit, offset))
        return result if result else []
    
    # Analysis operations
    def get_frequency_analysis(self) -> Dict[str, Dict[str, int]]:
        """Get frequency analysis of numbers"""
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
        
        white_results = self.execute(white_query) or []
        powerball_results = self.execute(powerball_query) or []
        
        white_freq = {str(i): 0 for i in range(1, 70)}
        pb_freq = {str(i): 0 for i in range(1, 27)}
        
        for row in white_results:
            white_freq[str(row['number'])] = row['count']
        
        for row in powerball_results:
            pb_freq[str(row['number'])] = row['count']
        
        return {
            "white_balls": white_freq,
            "powerballs": pb_freq
        }
    
    def save_analysis_result(self, analysis_type: str, result_data: Dict[str, Any], 
                           parameters: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        """Save an analysis result"""
        query = """
        INSERT INTO analysis_results (type, parameters, result_data)
        VALUES (%s, %s, %s)
        RETURNING *
        """
        
        result = self.execute(query, (
            analysis_type, 
            psycopg2.extras.Json(parameters) if parameters else None,
            psycopg2.extras.Json(result_data)
        ))
        
        return result[0] if result else None
    
    def get_analysis_results(self, analysis_type: str, 
                           limit: int = 1) -> List[Dict[str, Any]]:
        """Get recent analysis results of a specific type"""
        query = """
        SELECT *
        FROM analysis_results
        WHERE type = %s
        ORDER BY created_at DESC
        LIMIT %s
        """
        
        result = self.execute(query, (analysis_type, limit))
        return result if result else []
    
    # Expected combinations operations
    def add_expected_combination(self, white_balls: List[int], powerball: int,
                              score: float, method: str, reason: str) -> Optional[Dict[str, Any]]:
        """Add an expected combination"""
        query = """
        INSERT INTO expected_combinations (score, method, reason)
        VALUES (%s, %s, %s)
        RETURNING id
        """
        
        result = self.execute(query, (score, method, reason))
        
        if result:
            combo_id = result[0]['id']
            
            # Would add numbers here, but for simplicity we're storing them in the view
            
            return {
                'id': combo_id,
                'white_balls': white_balls,
                'powerball': powerball,
                'score': score,
                'method': method,
                'reason': reason,
                'created_at': datetime.now().isoformat()
            }
        
        return None
    
    def get_expected_combinations(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get top expected combinations"""
        query = """
        SELECT *
        FROM expected_combinations
        ORDER BY score DESC
        LIMIT %s
        """
        
        result = self.execute(query, (limit,))
        return result if result else []
    
    def clear_expected_combinations(self) -> bool:
        """Clear all expected combinations"""
        query = "DELETE FROM expected_combinations"
        self.execute(query)
        return True

# Singleton instance
_db_instance = None

def get_db() -> PostgresDB:
    """Get the database singleton instance"""
    global _db_instance
    
    if _db_instance is None:
        _db_instance = PostgresDB()
    
    return _db_instance
import os
import logging
import psycopg2
from psycopg2.extras import RealDictCursor
import time
from typing import List, Dict, Any, Optional, Tuple

# Configure logging
logger = logging.getLogger("powerball-analyzer-db")

class DatabaseConnector:
    """
    Database connector for PostgreSQL that handles connection and basic CRUD operations
    """
    
    def __init__(self, db_url: Optional[str] = None, max_retries: int = 15, retry_interval: int = 10):
        """
        Initialize the database connector
        
        Args:
            db_url: The database connection URL (defaults to DATABASE_URL env var)
            max_retries: Maximum number of connection retries
            retry_interval: Interval between retries in seconds
        """
        self.db_url = db_url or os.environ.get('DATABASE_URL', 'postgresql://powerball:powerball@db:5432/powerball')
        self.max_retries = max_retries
        self.retry_interval = retry_interval
        self.conn = None
        
        logger.info(f"Database connector initialized with URL: {self.db_url}")
    
    def _parse_connection_params(self) -> Dict[str, str]:
        """Parse the connection URL into connection parameters"""
        # Example: postgresql://user:password@host:port/dbname
        # Remove postgresql://
        params_str = self.db_url.replace('postgresql://', '')
        
        # Split user:password@host:port/dbname
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
            host, port = host_port[0], '5432'  # Default PostgreSQL port
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
        """
        Connect to the database with retries
        
        Returns:
            bool: True if connection succeeded, False otherwise
        """
        for attempt in range(1, self.max_retries + 1):
            try:
                if self.conn is not None and not self.conn.closed:
                    logger.info("Already connected to the database")
                    return True
                
                logger.info(f"Connecting to database (attempt {attempt}/{self.max_retries})...")
                
                # Parse connection parameters
                conn_params = self._parse_connection_params()
                
                # Connect
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
        """Close the database connection"""
        if self.conn is not None and not self.conn.closed:
            self.conn.close()
            logger.info("Database connection closed")
    
    def execute(self, query: str, params: tuple = None) -> Optional[List[Dict[str, Any]]]:
        """
        Execute a query and return the results
        
        Args:
            query: SQL query to execute
            params: Query parameters
            
        Returns:
            List of dictionaries containing the query results, or None if the query fails
        """
        if not self.connect():
            return None
        
        try:
            with self.conn.cursor() as cursor:
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
    
    def init_schema(self) -> bool:
        """
        Initialize the database schema
        
        Returns:
            bool: True if schema initialization succeeded, False otherwise
        """
        schema_queries = [
            # Create draws table
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
            
            # Create numbers table for individual number storage
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
            
            # Create predictions table
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
            
            # Create expected_combinations table
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
            
            # Create user_checks table
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
            
            # Create user_stats table
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
        
        # Add indexes for performance
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
                self.execute(query)
            
            logger.info("Database schema initialized successfully")
            return True
        
        except Exception as e:
            logger.error(f"Error initializing database schema: {str(e)}")
            return False

    # Draw management methods
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
                 powerball: int, jackpot_amount: float = 0, winners: int = 0) -> Optional[Dict[str, Any]]:
        """Add a new draw"""
        # Check if draw already exists
        if self.get_draw_by_number(draw_number):
            logger.warning(f"Draw {draw_number} already exists")
            return None
        
        # Insert draw
        query = """
        INSERT INTO draws 
        (draw_number, draw_date, white_balls, powerball, jackpot_amount, winners) 
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING *
        """
        result = self.execute(query, (
            draw_number, draw_date, white_balls, powerball, jackpot_amount, winners
        ))
        
        if not result:
            return None
        
        draw = result[0]
        
        # Insert individual numbers
        for i, num in enumerate(white_balls):
            self.execute(
                "INSERT INTO numbers (draw_id, position, number, is_powerball) VALUES (%s, %s, %s, %s)",
                (draw["id"], i+1, num, False)
            )
        
        # Insert powerball
        self.execute(
            "INSERT INTO numbers (draw_id, position, number, is_powerball) VALUES (%s, %s, %s, %s)",
            (draw["id"], 6, powerball, True)
        )
        
        return draw
    
    # Prediction methods
    def add_prediction(self, white_balls: List[int], powerball: int, 
                      confidence: float, method: str, rationale: str, 
                      user_id: str = "anonymous") -> Optional[Dict[str, Any]]:
        """Add a new prediction"""
        query = """
        INSERT INTO predictions 
        (white_balls, powerball, confidence, method, rationale, user_id) 
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING *
        """
        result = self.execute(query, (
            white_balls, powerball, confidence, method, rationale, user_id
        ))
        
        if result:
            # Update user stats
            self.update_user_stat(user_id, "predictions_made")
        
        return result[0] if result else None
    
    def get_predictions(self, method: str = None, user_id: str = None, 
                       limit: int = 10, offset: int = 0) -> List[Dict[str, Any]]:
        """Get predictions with filtering"""
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
        
        return self.execute(query, tuple(params)) or []
    
    # Expected combinations methods
    def add_expected_combination(self, white_balls: List[int], powerball: int, 
                               score: float, method: str, reason: str) -> Optional[Dict[str, Any]]:
        """Add a new expected combination"""
        query = """
        INSERT INTO expected_combinations 
        (white_balls, powerball, score, method, reason) 
        VALUES (%s, %s, %s, %s, %s)
        RETURNING *
        """
        result = self.execute(query, (
            white_balls, powerball, score, method, reason
        ))
        
        return result[0] if result else None
    
    def get_expected_combinations(self, limit: int = 10, offset: int = 0) -> List[Dict[str, Any]]:
        """Get expected combinations"""
        query = """
        SELECT * FROM expected_combinations 
        ORDER BY score DESC 
        LIMIT %s OFFSET %s
        """
        return self.execute(query, (limit, offset)) or []
    
    def clear_expected_combinations(self) -> bool:
        """Clear all expected combinations"""
        query = "DELETE FROM expected_combinations"
        self.execute(query)
        return True
    
    # User checks methods
    def add_user_check(self, user_id: str, draw_id: int, numbers: List[int], 
                      white_matches: List[int], powerball_match: bool, 
                      is_winner: bool, prize: str) -> Optional[Dict[str, Any]]:
        """Add a new user check"""
        query = """
        INSERT INTO user_checks 
        (user_id, draw_id, numbers, white_matches, powerball_match, is_winner, prize) 
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING *
        """
        result = self.execute(query, (
            user_id, draw_id, numbers, white_matches, powerball_match, is_winner, prize
        ))
        
        if result:
            # Update user stats
            self.update_user_stat(user_id, "analysis_runs")
        
        return result[0] if result else None
    
    def get_user_checks(self, user_id: str, limit: int = 10, offset: int = 0) -> List[Dict[str, Any]]:
        """Get user checks"""
        query = """
        SELECT uc.*, d.draw_number, d.draw_date, d.white_balls as draw_white_balls, d.powerball as draw_powerball
        FROM user_checks uc
        JOIN draws d ON uc.draw_id = d.id
        WHERE uc.user_id = %s
        ORDER BY uc.created_at DESC
        LIMIT %s OFFSET %s
        """
        return self.execute(query, (user_id, limit, offset)) or []
    
    # User stats methods
    def get_user_stats(self, user_id: str) -> Dict[str, Any]:
        """Get user stats"""
        query = "SELECT * FROM user_stats WHERE user_id = %s"
        result = self.execute(query, (user_id,))
        
        if not result:
            # Create new user stats
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
    
    def update_user_stat(self, user_id: str, field: str) -> Optional[Dict[str, Any]]:
        """Update a specific user stat"""
        valid_fields = ["draws_added", "predictions_made", "analysis_runs"]
        if field not in valid_fields:
            logger.error(f"Invalid user stat field: {field}")
            return None
        
        # Get current stats
        stats = self.get_user_stats(user_id)
        
        # Update the field
        query = f"""
        UPDATE user_stats 
        SET {field} = {field} + 1, updated_at = NOW() 
        WHERE user_id = %s
        RETURNING *
        """
        result = self.execute(query, (user_id,))
        
        return result[0] if result else None
    
    # Analysis methods
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
            white_freq[str(row["number"])] = row["count"]
        
        for row in powerball_results:
            pb_freq[str(row["number"])] = row["count"]
        
        return {
            "white_balls": white_freq,
            "powerballs": pb_freq
        }
    
    def get_position_analysis(self) -> List[Dict[str, Any]]:
        """Get analysis of numbers by position"""
        query = """
        SELECT position, number, COUNT(*) as count
        FROM numbers
        WHERE is_powerball = FALSE
        GROUP BY position, number
        ORDER BY position, count DESC
        """
        results = self.execute(query) or []
        
        # Group by position
        positions = {}
        for row in results:
            pos = row["position"]
            if pos not in positions:
                positions[pos] = []
            
            positions[pos].append({
                "number": row["number"],
                "count": row["count"]
            })
        
        # Format the response
        response = []
        for pos in sorted(positions.keys()):
            response.append({
                "position": pos,
                "top_numbers": positions[pos][:5]  # Top 5 numbers for each position
            })
        
        return response
    
    def get_pair_analysis(self) -> List[Dict[str, Any]]:
        """Get analysis of number pairs"""
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
        results = self.execute(query) or []
        
        return [{"pair": [row["num1"], row["num2"]], "count": row["count"]} for row in results]
    
    def get_hot_numbers(self, limit: int = 10) -> Dict[str, Dict[str, int]]:
        """Get the most frequently drawn numbers in recent draws"""
        # Get the last 20 draws
        latest_draws_query = """
        SELECT id FROM draws
        ORDER BY draw_date DESC
        LIMIT 20
        """
        latest_draws = self.execute(latest_draws_query) or []
        
        if not latest_draws:
            return {"white_balls": {}, "powerballs": {}}
        
        # Extract draw IDs
        draw_ids = [str(draw["id"]) for draw in latest_draws]
        ids_str = ",".join(draw_ids)
        
        # Get hot white balls
        white_query = f"""
        SELECT number, COUNT(*) as count
        FROM numbers
        WHERE is_powerball = FALSE AND draw_id IN ({ids_str})
        GROUP BY number
        ORDER BY count DESC
        LIMIT {limit}
        """
        
        # Get hot powerballs
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
    
    def get_due_numbers(self, limit: int = 10) -> Dict[str, Dict[str, int]]:
        """Get the least recently drawn numbers"""
        # First, get all numbers that have appeared
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
        
        white_results = self.execute(white_query, (limit,)) or []
        powerball_results = self.execute(powerball_query) or []
        
        return {
            "white_balls": {str(row["number"]): row["last_draw"] for row in white_results},
            "powerballs": {str(row["number"]): row["last_draw"] for row in powerball_results}
        }
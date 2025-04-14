import logging
from database import DatabaseConnector
from typing import Optional
from tenacity import retry, stop_after_attempt, wait_fixed
import os

# Configure logging
logger = logging.getLogger("powerball-db-setup")

class DatabaseSetup:
    """
    Handles database setup and connection management for the application
    """
    
    def __init__(self, db_url: Optional[str] = None):
        """Initialize the database setup"""
        self.db_url = db_url or os.environ.get('DATABASE_URL', 'postgresql://powerball:powerball@db:5432/powerball')
        self.db = DatabaseConnector(self.db_url)
        logger.info("Database setup initialized")
    
    @retry(stop=stop_after_attempt(5), wait=wait_fixed(5))
    def initialize(self) -> bool:
        """
        Initialize the database schema and connections
        
        Returns:
            bool: True if initialization succeeded, False otherwise
        """
        try:
            logger.info("Connecting to database...")
            if not self.db.connect():
                logger.error("Failed to connect to database")
                return False
            
            logger.info("Initializing database schema...")
            if not self.db.init_schema():
                logger.error("Failed to initialize database schema")
                return False
            
            logger.info("Database initialization complete")
            return True
        
        except Exception as e:
            logger.error(f"Error during database initialization: {str(e)}")
            return False
    
    def get_connector(self) -> DatabaseConnector:
        """
        Get the database connector
        
        Returns:
            DatabaseConnector: The database connector instance
        """
        return self.db
    
    def close(self) -> None:
        """Close the database connection"""
        self.db.close()

# Singleton instance for the database setup
_db_setup: Optional[DatabaseSetup] = None

def get_db_setup() -> DatabaseSetup:
    """
    Get or create the database setup instance
    
    Returns:
        DatabaseSetup: The database setup instance
    """
    global _db_setup
    if _db_setup is None:
        _db_setup = DatabaseSetup()
    return _db_setup

def get_db() -> DatabaseConnector:
    """
    Get the database connector (for dependency injection in FastAPI)
    
    Returns:
        DatabaseConnector: The database connector instance
    """
    db_setup = get_db_setup()
    return db_setup.get_connector()
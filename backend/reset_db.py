import os
import psycopg2
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("db-reset")

# Get database connection string
db_url = os.environ.get('DATABASE_URL', 'postgresql://powerball:powerball@db:5432/powerball')

try:
    # Connect to database
    logger.info(f"Connecting to database")
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    
    with conn.cursor() as cursor:
        # Read the schema SQL file
        logger.info("Reading schema file")
        schema_path = os.path.join(os.path.dirname(__file__), 'schema.sql')
        with open(schema_path, 'r') as f:
            schema_sql = f.read()
        
        # Execute the schema SQL
        logger.info("Executing schema")
        cursor.execute(schema_sql)
        
    logger.info("Database schema reset successfully")
    
except Exception as e:
    logger.error(f"Error resetting database: {str(e)}")
finally:
    if 'conn' in locals() and conn is not None:
        conn.close()

print("Database schema has been reset. Please restart your backend service.")
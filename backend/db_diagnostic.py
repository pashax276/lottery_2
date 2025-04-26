# Save this as db_diagnostic.py in your backend folder

import psycopg2
from psycopg2.extras import RealDictCursor
import logging
import sys
import os

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("db-diagnostic")

def test_connection(db_url):
    """Test the database connection"""
    try:
        logger.info(f"Connecting to database with URL: {db_url}")
        conn = psycopg2.connect(db_url, cursor_factory=RealDictCursor)
        conn.autocommit = True
        logger.info("✅ Connection successful!")
        return conn
    except Exception as e:
        logger.error(f"❌ Connection failed: {str(e)}")
        return None

def check_tables(conn):
    """Check if required tables exist and have the expected structure"""
    try:
        with conn.cursor() as cursor:
            # Get list of tables
            cursor.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
            """)
            tables = [row['table_name'] for row in cursor.fetchall()]
            
            expected_tables = ['draws', 'numbers', 'predictions', 'user_checks', 'users', 'user_stats']
            
            logger.info(f"Found tables: {', '.join(tables)}")
            
            missing_tables = [table for table in expected_tables if table not in tables]
            if missing_tables:
                logger.error(f"❌ Missing tables: {', '.join(missing_tables)}")
            else:
                logger.info("✅ All expected tables exist")
            
            # Check draws table structure
            if 'draws' in tables:
                cursor.execute("""
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_name = 'draws'
                """)
                columns = {row['column_name']: row['data_type'] for row in cursor.fetchall()}
                logger.info(f"Draws table columns: {columns}")
                
                required_columns = ['id', 'draw_number', 'draw_date', 'jackpot_amount', 'winners', 'created_at']
                missing_columns = [col for col in required_columns if col not in columns]
                
                if missing_columns:
                    logger.error(f"❌ Missing columns in draws table: {', '.join(missing_columns)}")
                else:
                    logger.info("✅ Draws table has all required columns")
            
            # Check numbers table structure
            if 'numbers' in tables:
                cursor.execute("""
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_name = 'numbers'
                """)
                columns = {row['column_name']: row['data_type'] for row in cursor.fetchall()}
                logger.info(f"Numbers table columns: {columns}")
                
                required_columns = ['id', 'draw_id', 'position', 'number', 'is_powerball']
                missing_columns = [col for col in required_columns if col not in columns]
                
                if missing_columns:
                    logger.error(f"❌ Missing columns in numbers table: {', '.join(missing_columns)}")
                else:
                    logger.info("✅ Numbers table has all required columns")
    except Exception as e:
        logger.error(f"❌ Error checking tables: {str(e)}")

def insert_test_draw(conn):
    """Try to insert a test draw and verify it was added correctly"""
    try:
        draw_number = 9999
        draw_date = '2025-04-19'
        white_balls = [1, 2, 3, 4, 5]
        powerball = 10
        
        # Check if the test draw already exists
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM draws WHERE draw_number = %s", (draw_number,))
            existing = cursor.fetchone()
            if existing:
                logger.info(f"Test draw {draw_number} already exists, removing it first")
                cursor.execute("DELETE FROM draws WHERE draw_number = %s", (draw_number,))
        
        # Insert the draw
        with conn.cursor() as cursor:
            logger.info(f"Inserting test draw: {draw_number}, {draw_date}, {white_balls}, {powerball}")
            cursor.execute("""
                INSERT INTO draws (draw_number, draw_date, jackpot_amount, winners)
                VALUES (%s, %s, %s, %s)
                RETURNING id
            """, (draw_number, draw_date, 0, 0))
            
            draw_id = cursor.fetchone()['id']
            
            # Insert the numbers
            for i, number in enumerate(white_balls):
                cursor.execute("""
                    INSERT INTO numbers (draw_id, position, number, is_powerball)
                    VALUES (%s, %s, %s, %s)
                """, (draw_id, i+1, number, False))
            
            # Insert the powerball
            cursor.execute("""
                INSERT INTO numbers (draw_id, position, number, is_powerball)
                VALUES (%s, %s, %s, %s)
            """, (draw_id, 6, powerball, True))
        
        # Verify the draw was added
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT d.id, d.draw_number, d.draw_date, d.jackpot_amount, d.winners,
                       array_agg(CASE WHEN n.is_powerball = false THEN n.number END ORDER BY n.position) FILTER (WHERE n.is_powerball = false) AS white_balls,
                       (array_agg(n.number) FILTER (WHERE n.is_powerball = true))[1] AS powerball
                FROM draws d
                JOIN numbers n ON d.id = n.draw_id
                WHERE d.draw_number = %s
                GROUP BY d.id, d.draw_number
            """, (draw_number,))
            
            result = cursor.fetchone()
            
            if result:
                logger.info(f"✅ Test draw was successfully added and retrieved: {result}")
                
                # Clean up - remove the test draw
                cursor.execute("DELETE FROM numbers WHERE draw_id = %s", (draw_id,))
                cursor.execute("DELETE FROM draws WHERE id = %s", (draw_id,))
                logger.info("Cleaned up test draw")
            else:
                logger.error("❌ Failed to retrieve the test draw that was just inserted")
    
    except Exception as e:
        logger.error(f"❌ Error inserting test draw: {str(e)}")

def check_permissions(conn):
    """Check if the database user has the necessary permissions"""
    try:
        with conn.cursor() as cursor:
            # Get current user
            cursor.execute("SELECT current_user")
            current_user = cursor.fetchone()['current_user']
            logger.info(f"Connected as user: {current_user}")
            
            # Check table privileges
            cursor.execute("""
                SELECT table_name, privilege_type
                FROM information_schema.table_privileges
                WHERE grantee = current_user AND table_schema = 'public'
            """)
            
            privileges = cursor.fetchall()
            table_privileges = {}
            
            for priv in privileges:
                table = priv['table_name']
                privilege = priv['privilege_type']
                
                if table not in table_privileges:
                    table_privileges[table] = []
                
                table_privileges[table].append(privilege)
            
            for table, privs in table_privileges.items():
                logger.info(f"Table {table} privileges: {', '.join(privs)}")
                
                if 'INSERT' not in privs:
                    logger.error(f"❌ Missing INSERT privilege on table {table}")
                if 'SELECT' not in privs:
                    logger.error(f"❌ Missing SELECT privilege on table {table}")
                if 'UPDATE' not in privs:
                    logger.error(f"❌ Missing UPDATE privilege on table {table}")
                if 'DELETE' not in privs:
                    logger.error(f"❌ Missing DELETE privilege on table {table}")
    
    except Exception as e:
        logger.error(f"❌ Error checking permissions: {str(e)}")

def print_separator(title):
    """Print a separator with a title"""
    logger.info("\n" + "=" * 50)
    logger.info(f" {title} ".center(50, "="))
    logger.info("=" * 50)

def fix_issues(conn, apply_fixes=False):
    """Try to fix common issues"""
    try:
        print_separator("POTENTIAL FIXES")
        
        missing_tables = False
        with conn.cursor() as cursor:
            # Check if draws table exists
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' AND table_name = 'draws'
                )
            """)
            draws_exists = cursor.fetchone()['exists']
            
            if not draws_exists:
                missing_tables = True
                logger.info("❌ Draws table doesn't exist - need to initialize schema")
        
        if missing_tables:
            logger.info("Problem: Database schema not initialized")
            logger.info("Fix: Run the schema initialization SQL")
            
            if apply_fixes:
                # Try to find schema.sql in current directory or parent directories
                schema_path = None
                for root_dir in ['.', '..', '../..', '../../..']:
                    potential_paths = [
                        os.path.join(root_dir, 'schema.sql'),
                        os.path.join(root_dir, 'backend/schema.sql'),
                        os.path.join(root_dir, 'db/schema.sql'),
                        os.path.join(root_dir, 'sql/schema.sql')
                    ]
                    
                    for path in potential_paths:
                        if os.path.exists(path):
                            schema_path = path
                            break
                    
                    if schema_path:
                        break
                
                if schema_path:
                    logger.info(f"Found schema file at {schema_path}")
                    with open(schema_path, 'r') as f:
                        schema_sql = f.read()
                    
                    with conn.cursor() as cursor:
                        logger.info("Executing schema SQL...")
                        cursor.execute(schema_sql)
                    
                    logger.info("✅ Schema initialized successfully")
                else:
                    logger.error("❌ Could not find schema.sql file")
            else:
                logger.info("Run with --fix to apply this fix")
        
        # Check if connection is autocommit
        logger.info(f"Current autocommit setting: {conn.autocommit}")
        if not conn.autocommit:
            logger.info("Problem: Autocommit is disabled, transactions might not be committed")
            logger.info("Fix: Enable autocommit")
            
            if apply_fixes:
                conn.autocommit = True
                logger.info("✅ Autocommit enabled")
            else:
                logger.info("Run with --fix to apply this fix")
    
    except Exception as e:
        logger.error(f"❌ Error fixing issues: {str(e)}")

def main():
    # Get database URL from environment or use default
    db_url = os.environ.get('DATABASE_URL', 'postgresql://powerball:powerball@db:5432/powerball')
    
    # Check if --fix flag is provided
    apply_fixes = '--fix' in sys.argv
    
    print_separator("DATABASE DIAGNOSTICS")
    logger.info(f"Starting database diagnostics with URL: {db_url}")
    
    # Test connection
    conn = test_connection(db_url)
    if not conn:
        logger.error("Cannot proceed with diagnostics without database connection")
        return 1
    
    try:
        # Check tables
        print_separator("TABLE CHECK")
        check_tables(conn)
        
        # Check permissions
        print_separator("PERMISSION CHECK")
        check_permissions(conn)
        
        # Fix any issues
        fix_issues(conn, apply_fixes)
        
        # Test insertion
        print_separator("INSERTION TEST")
        insert_test_draw(conn)
        
        logger.info("\nDiagnostics complete. Check the logs above for any issues.")
        
        if not apply_fixes:
            logger.info("If issues were found, run with --fix to attempt automatic fixes")
    
    finally:
        conn.close()
    
    return 0

if __name__ == '__main__':
    sys.exit(main())
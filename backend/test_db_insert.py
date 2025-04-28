# Save as db_diagnostic.py in your backend directory

import psycopg2
from psycopg2.extras import RealDictCursor
import logging
import sys
import os

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("db-diagnostic")

def get_db_connection(db_url):
    """Create a database connection"""
    conn = psycopg2.connect(db_url, cursor_factory=RealDictCursor)
    conn.autocommit = True
    return conn

def run_diagnostics():
    # Get database URL from environment or use default
    db_url = os.environ.get('DATABASE_URL', 'postgresql://powerball:powerball@db:5432/powerball')
    
    try:
        logger.info(f"Connecting to database with URL: {db_url}")
        conn = get_db_connection(db_url)
        logger.info("✅ Database connection successful")
        
        # Check tables
        with conn.cursor() as cursor:
            # Check if draws table exists
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' AND table_name = 'draws'
                )
            """)
            draws_exists = cursor.fetchone()['exists']
            
            if draws_exists:
                logger.info("✅ Draws table exists")
            else:
                logger.error("❌ Draws table not found!")
            
            # Check if numbers table exists
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' AND table_name = 'numbers'
                )
            """)
            numbers_exists = cursor.fetchone()['exists']
            
            if numbers_exists:
                logger.info("✅ Numbers table exists")
            else:
                logger.error("❌ Numbers table not found!")
            
            # Check number of draws
            if draws_exists:
                cursor.execute("SELECT COUNT(*) AS count FROM draws")
                draw_count = cursor.fetchone()['count']
                logger.info(f"📊 Found {draw_count} draws in the database")
                
                # Get most recent draws
                cursor.execute("""
                    SELECT draw_number, draw_date, white_balls, powerball 
                    FROM draws 
                    ORDER BY draw_number DESC 
                    LIMIT 5
                """)
                recent_draws = cursor.fetchall()
                
                logger.info("Recent draws:")
                for draw in recent_draws:
                    logger.info(f"  #{draw['draw_number']} ({draw['draw_date']}): {draw['white_balls']} + {draw['powerball']}")
            
            # Check numbers entries
            if numbers_exists:
                cursor.execute("SELECT COUNT(*) AS count FROM numbers")
                number_count = cursor.fetchone()['count']
                logger.info(f"📊 Found {number_count} numbers in the database")
                
                # Check if numbers match draws (should be 6 numbers per draw)
                expected_numbers = draw_count * 6
                if number_count == expected_numbers:
                    logger.info(f"✅ Number of numbers ({number_count}) matches expected count ({expected_numbers})")
                else:
                    logger.warning(f"⚠️ Number of numbers ({number_count}) doesn't match expected count ({expected_numbers})")
                    
                    # Check which draws might be missing numbers
                    cursor.execute("""
                        SELECT d.id, d.draw_number, COUNT(n.id) AS num_count
                        FROM draws d
                        LEFT JOIN numbers n ON d.id = n.draw_id
                        GROUP BY d.id, d.draw_number
                        HAVING COUNT(n.id) != 6
                        ORDER BY d.draw_number DESC
                    """)
                    incomplete_draws = cursor.fetchall()
                    
                    if incomplete_draws:
                        logger.warning(f"Found {len(incomplete_draws)} draws with incorrect number of numbers:")
                        for draw in incomplete_draws:
                            logger.warning(f"  Draw #{draw['draw_number']} has {draw['num_count']} numbers (should be 6)")
            
            # Try a test insertion and deletion to verify permissions
            logger.info("Testing insert permissions...")
            try:
                # Create a test draw with a very high number to avoid conflicts
                test_draw_number = 9999999
                test_white_balls = [1, 2, 3, 4, 5]
                test_powerball = 10
                
                # Insert test draw
                cursor.execute("""
                    INSERT INTO draws (draw_number, draw_date, white_balls, powerball, jackpot_amount, winners, source)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (test_draw_number, '2025-04-26', test_white_balls, test_powerball, 0, 0, 'test'))
                
                test_draw_id = cursor.fetchone()['id']
                logger.info(f"✅ Successfully inserted test draw with ID {test_draw_id}")
                
                # Insert test numbers
                for i, number in enumerate(test_white_balls):
                    cursor.execute("""
                        INSERT INTO numbers (draw_id, position, number, is_powerball)
                        VALUES (%s, %s, %s, %s)
                    """, (test_draw_id, i+1, number, False))
                
                cursor.execute("""
                    INSERT INTO numbers (draw_id, position, number, is_powerball)
                    VALUES (%s, %s, %s, %s)
                """, (test_draw_id, 6, test_powerball, True))
                
                logger.info("✅ Successfully inserted test numbers")
                
                # Delete test data
                cursor.execute("DELETE FROM numbers WHERE draw_id = %s", (test_draw_id,))
                cursor.execute("DELETE FROM draws WHERE id = %s", (test_draw_id,))
                logger.info("✅ Successfully deleted test data")
                
            except Exception as e:
                logger.error(f"❌ Test insertion failed: {str(e)}")
        
        logger.info("Database diagnostics completed")
        return True
        
    except Exception as e:
        logger.error(f"❌ Error running diagnostics: {str(e)}")
        return False
    finally:
        if 'conn' in locals() and conn:
            conn.close()

if __name__ == "__main__":
    success = run_diagnostics()
    sys.exit(0 if success else 1)
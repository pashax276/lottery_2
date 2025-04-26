# Save this as add_draw_directly.py in your backend folder

import psycopg2
from psycopg2.extras import RealDictCursor
import logging
import sys
import os
import datetime

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("db-helper")

def get_db_connection(db_url):
    """Create a database connection"""
    conn = psycopg2.connect(db_url, cursor_factory=RealDictCursor)
    conn.autocommit = True
    return conn

def add_draw_directly():
    """Add a draw directly to the database, bypassing the API"""
    try:
        # Get database URL from environment or use default
        db_url = os.environ.get('DATABASE_URL', 'postgresql://powerball:powerball@db:5432/powerball')
        logger.info(f"Connecting to database with URL: {db_url}")
        
        # Connect to the database
        conn = get_db_connection(db_url)
        
        # Generate a unique draw number
        draw_number = int(datetime.datetime.now().timestamp())
        draw_date = datetime.date.today().isoformat()
        white_balls = [11, 22, 33, 44, 55]
        powerball = 26
        
        logger.info(f"Adding draw: #{draw_number} on {draw_date} with numbers {white_balls} and powerball {powerball}")
        
        # Add the draw
        with conn.cursor() as cursor:
            # Insert the draw
            cursor.execute("""
                INSERT INTO draws (draw_number, draw_date, jackpot_amount, winners)
                VALUES (%s, %s, %s, %s)
                RETURNING id
            """, (draw_number, draw_date, 1000000, 0))
            
            draw_id = cursor.fetchone()['id']
            logger.info(f"Created draw with ID: {draw_id}")
            
            # Insert the white balls
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
            
            logger.info(f"Added all numbers for draw #{draw_number}")
        
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
                logger.info(f"Successfully verified draw: {result}")
            else:
                logger.error(f"Failed to retrieve the draw that was just added!")
        
        # List all draws in the database
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT d.id, d.draw_number, d.draw_date, d.jackpot_amount, d.winners
                FROM draws d
                ORDER BY d.created_at DESC
                LIMIT 5
            """)
            
            draws = cursor.fetchall()
            
            if draws:
                logger.info("Recent draws in database:")
                for draw in draws:
                    logger.info(f"  #{draw['draw_number']} on {draw['draw_date']}")
            else:
                logger.info("No draws found in database")
        
        # Close the connection
        conn.close()
        
        logger.info("Draw added successfully!")
        return 0
    
    except Exception as e:
        logger.error(f"Error adding draw: {str(e)}")
        return 1

if __name__ == '__main__':
    sys.exit(add_draw_directly())
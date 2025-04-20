# Save this as check_connections.py in your backend folder

import psycopg2
from psycopg2.extras import RealDictCursor
import logging
import sys
import os
import socket

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("connection-checker")

def get_ip_address():
    """Get the container's IP address"""
    hostname = socket.gethostname()
    ip_address = socket.gethostbyname(hostname)
    return ip_address

def check_connection(db_url):
    """Test a database connection and report details"""
    try:
        # Log connection details
        logger.info(f"Attempting to connect with URL: {db_url}")
        
        # Get container network info
        ip = get_ip_address()
        logger.info(f"Container IP address: {ip}")
        
        # Try to resolve the database hostname
        db_host = db_url.split('@')[1].split(':')[0] if '@' in db_url else 'localhost'
        try:
            db_ip = socket.gethostbyname(db_host)
            logger.info(f"Database hostname '{db_host}' resolves to IP: {db_ip}")
        except socket.gaierror:
            logger.error(f"Could not resolve database hostname: {db_host}")
        
        # Connect to database
        conn = psycopg2.connect(db_url, cursor_factory=RealDictCursor)
        conn.autocommit = True
        
        # Get connection details
        with conn.cursor() as cursor:
            cursor.execute("SELECT current_database(), current_user, inet_server_addr(), inet_server_port()")
            info = cursor.fetchone()
            
            logger.info(f"Connected to database: {info['current_database']}")
            logger.info(f"Connected as user: {info['current_user']}")
            logger.info(f"Database server address: {info['inet_server_addr']}")
            logger.info(f"Database server port: {info['inet_server_port']}")
            
            # Check if any draws exist
            cursor.execute("SELECT COUNT(*) FROM draws")
            count = cursor.fetchone()['count']
            logger.info(f"Number of draws in database: {count}")
            
            # List most recent draws if any exist
            if count > 0:
                cursor.execute("""
                    SELECT id, draw_number, draw_date, created_at
                    FROM draws
                    ORDER BY created_at DESC
                    LIMIT 5
                """)
                draws = cursor.fetchall()
                logger.info("Recent draws:")
                for draw in draws:
                    logger.info(f"  #{draw['draw_number']} on {draw['draw_date']} (created at {draw['created_at']})")
            
        # Close connection
        conn.close()
        return True
        
    except Exception as e:
        logger.error(f"Connection error: {str(e)}")
        return False

def check_all_possible_connections():
    """Check all possible database connections"""
    # Default URL from environment
    default_url = os.environ.get('DATABASE_URL', 'postgresql://powerball:powerball@db:5432/powerball')
    
    # Try different variations of the connection string
    connection_strings = [
        default_url,
        'postgresql://powerball:powerball@localhost:5432/powerball',
        'postgresql://powerball:powerball@127.0.0.1:5432/powerball',
        'postgresql://powerball:powerball@db:5432/postgres',
        'postgresql://postgres:postgres@db:5432/powerball',
        'postgresql://postgres:postgres@db:5432/postgres'
    ]
    
    # Try to extract host from default URL and add a connection string with IP
    if '@' in default_url:
        db_host = default_url.split('@')[1].split(':')[0]
        try:
            db_ip = socket.gethostbyname(db_host)
            ip_url = default_url.replace(db_host, db_ip)
            connection_strings.append(ip_url)
        except socket.gaierror:
            pass
    
    # Try each connection string
    for conn_str in connection_strings:
        logger.info(f"\nTrying connection: {conn_str}")
        if check_connection(conn_str):
            logger.info(f"Successfully connected using: {conn_str}")
        else:
            logger.info(f"Failed to connect using: {conn_str}")

def main():
    logger.info("Starting database connection checker")
    
    # Check all possible connections
    check_all_possible_connections()
    
    logger.info("\nConnection checking complete")
    return 0

if __name__ == '__main__':
    sys.exit(main())
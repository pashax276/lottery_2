import os
import logging
import httpx
import asyncio
import json

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("register-admin")

async def register_admin():
    """Register the default admin user if it doesn't exist"""
    
    admin_username = os.environ.get("ADMIN_USERNAME", "admin")
    admin_password = os.environ.get("ADMIN_PASSWORD", "powerball_admin")
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com")
    
    # API URL (localhost because this script runs inside the container)
    api_url = "http://localhost:5001"
    
    try:
        # Check if we can connect to the API
        async with httpx.AsyncClient(timeout=10.0) as client:
            health_response = await client.get(f"{api_url}/api/health")
            
            if not health_response.is_success:
                logger.error(f"API health check failed: {health_response.status_code}")
                return
                
            # Attempt to register the admin user
            register_data = {
                "username": admin_username,
                "password": admin_password,
                "email": admin_email
            }
            
            logger.info(f"Attempting to register admin user: {admin_username}")
            
            register_response = await client.post(
                f"{api_url}/api/auth/register",
                json=register_data
            )
            
            if register_response.is_success:
                logger.info("Admin user registered successfully")
                return
                
            # Check if the error is because the user already exists
            if register_response.status_code == 400:
                error_text = register_response.text
                if "already exists" in error_text:
                    logger.info("Admin user already exists")
                    return
            
            logger.error(f"Failed to register admin user: {register_response.status_code} - {register_response.text}")
    
    except Exception as e:
        logger.error(f"Error registering admin user: {str(e)}")

if __name__ == "__main__":
    # Wait for the API to be ready
    logger.info("Waiting for API to be ready...")
    asyncio.run(asyncio.sleep(10))
    
    # Register admin user
    asyncio.run(register_admin())
import httpx
import os
import time
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("data/logs/register_admin.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("register-admin")

API_URL = os.environ.get("API_URL", "http://localhost:5001")
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "powerball_admin")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@example.com")

async def check_api_ready():
    async with httpx.AsyncClient() as client:
        for _ in range(30):
            try:
                response = await client.get(f"{API_URL}/api/health")
                if response.status_code == 200:
                    logger.info("API is ready")
                    return True
            except httpx.RequestError:
                logger.debug("API not ready, retrying...")
            await asyncio.sleep(2)
        logger.error("API not ready after 60 seconds")
        return False

async def register_admin():
    async with httpx.AsyncClient() as client:
        try:
            # Check if user already exists by attempting login
            login_data = {
                "username": ADMIN_USERNAME,
                "password": ADMIN_PASSWORD
            }
            login_response = await client.post(f"{API_URL}/api/auth/token", data=login_data)
            if login_response.status_code == 200:
                logger.info(f"Admin user '{ADMIN_USERNAME}' already exists and can log in")
                return True
            
            # Register new admin user
            data = {
                "username": ADMIN_USERNAME,
                "password": ADMIN_PASSWORD,
                "email": ADMIN_EMAIL
            }
            response = await client.post(f"{API_URL}/api/auth/register", json=data)
            if response.status_code == 200:
                logger.info(f"Successfully registered admin user: {ADMIN_USERNAME}")
                return True
            elif response.status_code == 400 and "Username already exists" in response.text:
                logger.info(f"Admin user '{ADMIN_USERNAME}' already exists")
                return True
            else:
                logger.error(f"Failed to register admin user: {response.status_code} - {response.text}")
                return False
        except httpx.RequestError as e:
            logger.error(f"Error communicating with API: {str(e)}")
            return False

async def main():
    logger.info("Waiting for API to be ready...")
    if await check_api_ready():
        logger.info(f"Attempting to register admin user: {ADMIN_USERNAME}")
        success = await register_admin()
        if not success:
            logger.error("Admin registration failed")
            exit(1)
    else:
        logger.error("API not available")
        exit(1)

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
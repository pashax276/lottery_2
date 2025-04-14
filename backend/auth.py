import os
import logging
import jwt
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel

# Import database
from db import get_db

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("powerball-auth")

# Authentication settings
SECRET_KEY = os.environ.get("SECRET_KEY", "powerball_secret_key_change_in_production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/token")

# Models
class Token(BaseModel):
    access_token: str
    token_type: str
    user_id: int
    username: str

class TokenData(BaseModel):
    username: Optional[str] = None
    user_id: Optional[int] = None

class UserCreate(BaseModel):
    username: str
    email: Optional[str] = None
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class User(BaseModel):
    id: int
    username: str
    email: Optional[str] = None

# Helper functions
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Get password hash"""
    return pwd_context.hash(password)

def create_user(user_data: UserCreate) -> Optional[Dict[str, Any]]:
    """Create a new user"""
    db = get_db()
    
    try:
        # Check if username already exists
        query = "SELECT * FROM users WHERE username = %s"
        existing_user = db.execute(query, (user_data.username,))
        
        if existing_user:
            logger.warning(f"Username '{user_data.username}' already exists")
            return None
        
        # Hash the password
        hashed_password = get_password_hash(user_data.password)
        
        # Insert the user
        query = """
        INSERT INTO users (username, email, password_hash)
        VALUES (%s, %s, %s)
        RETURNING id, username, email
        """
        
        result = db.execute(query, (
            user_data.username,
            user_data.email,
            hashed_password
        ))
        
        if not result:
            return None
        
        # Create user stats
        db.get_user_stats(result[0]['id'])
        
        return result[0]
    
    except Exception as e:
        logger.error(f"Error creating user: {str(e)}")
        return None

def authenticate_user(username: str, password: str) -> Optional[Dict[str, Any]]:
    """Authenticate a user by username and password"""
    db = get_db()
    
    try:
        # Get user
        query = "SELECT id, username, email, password_hash FROM users WHERE username = %s"
        result = db.execute(query, (username,))
        
        if not result:
            return None
        
        user = result[0]
        
        # Verify password
        if not verify_password(password, user['password_hash']):
            return None
        
        # Return user without password hash
        del user['password_hash']
        return user
    
    except Exception as e:
        logger.error(f"Error authenticating user: {str(e)}")
        return None

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Create a new access token"""
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)) -> Dict[str, Any]:
    """Get the current user from a token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        # Decode token
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        user_id = payload.get("user_id")
        
        if username is None or user_id is None:
            raise credentials_exception
        
        token_data = TokenData(username=username, user_id=user_id)
    
    except jwt.PyJWTError:
        raise credentials_exception
    
    # Get user from database
    db = get_db()
    query = "SELECT id, username, email FROM users WHERE id = %s AND username = %s"
    result = db.execute(query, (token_data.user_id, token_data.username))
    
    if not result:
        raise credentials_exception
    
    return result[0]

def init_auth_schema() -> None:
    """Initialize authentication schema"""
    db = get_db()
    
    # Check if password_hash column exists in users table, if not add it
    query = """
    DO $$ 
    BEGIN
        IF NOT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'password_hash'
        ) THEN
            ALTER TABLE users ADD COLUMN password_hash TEXT;
        END IF;
    END $$;
    """
    
    db.execute(query)
    
    # Create admin user if it doesn't exist
    query = "SELECT * FROM users WHERE username = 'admin'"
    result = db.execute(query)
    
    if not result:
        # Create admin user
        admin_password = os.environ.get("ADMIN_PASSWORD", "powerball_admin")
        admin_username = os.environ.get("ADMIN_USERNAME", "admin")
        admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com")
        
        create_user(UserCreate(
            username=admin_username,
            email=admin_email,
            password=admin_password
        ))
        logger.info(f"Created admin user: {admin_username}")

def get_optional_user(token: Optional[str] = Depends(oauth2_scheme)) -> Optional[Dict[str, Any]]:
    """Get the current user if authenticated, or None"""
    try:
        if token:
            return get_current_user(token)
        return None
    except HTTPException:
        return None

# Schema modification
def init_auth_schema() -> None:
    """Initialize authentication schema"""
    db = get_db()
    
    # Add password_hash column to users table if it doesn't exist
    query = """
    DO $$ 
    BEGIN
        IF NOT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'password_hash'
        ) THEN
            ALTER TABLE users ADD COLUMN password_hash TEXT;
        END IF;
    END $$;
    """
    
    db.execute(query)
    
    # Create admin user if it doesn't exist
    query = "SELECT * FROM users WHERE username = 'admin'"
    result = db.execute(query)
    
    if not result:
        # Create admin user
        admin_password = os.environ.get("ADMIN_PASSWORD", "powerball_admin")
        create_user(UserCreate(
            username="admin",
            email="admin@example.com",
            password=admin_password
        ))
        logger.info("Created admin user")
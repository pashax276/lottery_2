import os
import logging
import jwt
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Union, List
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, Field, EmailStr, field_validator
import re

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
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)

# Models
class Token(BaseModel):
    access_token: str
    token_type: str
    user_id: int
    username: str
    is_admin: bool = False

class TokenData(BaseModel):
    username: Optional[str] = None
    user_id: Optional[int] = None

class UserCreate(BaseModel):
    username: str
    email: Optional[str] = None
    password: str
    
    @field_validator('username')
    @classmethod
    def username_valid(cls, v):
        if len(v) < 3:
            raise ValueError('Username must be at least 3 characters')
        if not re.match(r'^[a-zA-Z0-9_]+$', v):
            raise ValueError('Username can only contain letters, numbers, and underscores')
        return v
    
    @field_validator('password')
    @classmethod
    def password_valid(cls, v):
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters')
        return v

class UserLogin(BaseModel):
    username: str
    password: str

class User(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    is_admin: bool = False

# Helper functions
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception as e:
        logger.error(f"Error verifying password: {str(e)}")
        return False

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
        
        # Check if email already exists (if provided)
        if user_data.email:
            query = "SELECT * FROM users WHERE email = %s"
            existing_email = db.execute(query, (user_data.email,))
            
            if existing_email:
                logger.warning(f"Email '{user_data.email}' already exists")
                return None
        
        # Hash the password
        hashed_password = get_password_hash(user_data.password)
        
        # Insert the user
        query = """
        INSERT INTO users (username, email, password_hash, is_admin)
        VALUES (%s, %s, %s, %s)
        RETURNING id, username, email, is_admin
        """
        
        result = db.execute(query, (
            user_data.username,
            user_data.email,
            hashed_password,
            False  # New users are not admins by default
        ))
        
        if not result:
            logger.error("User creation failed: no result returned from database")
            return None
        
        # Create user stats
        db.execute("""
            INSERT INTO user_stats (user_id)
            VALUES (%s)
            ON CONFLICT (user_id) DO NOTHING
        """, (result[0]['id'],))
        
        logger.info(f"User created successfully: {user_data.username}, ID: {result[0]['id']}")
        return result[0]
    
    except Exception as e:
        logger.error(f"Error creating user: {str(e)}")
        return None

def authenticate_user(username: str, password: str) -> Optional[Dict[str, Any]]:
    """Authenticate a user by username and password"""
    db = get_db()
    
    try:
        # Get user
        query = "SELECT id, username, email, password_hash, is_admin FROM users WHERE username = %s"
        result = db.execute(query, (username,))
        
        if not result:
            logger.warning(f"User not found: {username}")
            return None
        
        user = result[0]
        
        # Verify password
        if not verify_password(password, user['password_hash']):
            logger.warning(f"Invalid password for user: {username}")
            return None
        
        # Log successful authentication
        logger.info(f"User authenticated successfully: {username}, ID: {user['id']}")
        
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

async def extract_token_from_header(request: Request) -> Optional[str]:
    """Extract token from Authorization header"""
    auth_header = request.headers.get("Authorization")
    
    if not auth_header:
        return None
    
    # Log header for debugging
    logger.debug(f"Authorization header: {auth_header}")
    
    # Check for Bearer token format
    if not auth_header.startswith("Bearer "):
        logger.warning(f"Invalid Authorization header format: {auth_header}")
        return None
    
    # Extract token
    token = auth_header.replace("Bearer ", "").strip()
    
    if not token:
        logger.warning("Empty token in Authorization header")
        return None
    
    return token

async def get_current_user(token: str = Depends(oauth2_scheme), request: Request = None) -> Dict[str, Any]:
    """Get the current user from a token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # Try to get token from header if not provided by dependency
    if not token and request:
        token = await extract_token_from_header(request)
    
    if not token:
        logger.warning("No token provided for authentication")
        raise credentials_exception
    
    try:
        # Decode the token
        try:
            logger.debug(f"Attempting to decode token: {token[:10]}...")
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        except jwt.PyJWTError as jwt_error:
            logger.error(f"JWT decode error: {str(jwt_error)}")
            raise credentials_exception
            
        # Extract user info from token
        username = payload.get("sub")
        user_id = payload.get("user_id")
        
        if username is None or user_id is None:
            logger.warning("Missing username or user_id in token payload")
            raise credentials_exception
        
        token_data = TokenData(username=username, user_id=user_id)
    
    except Exception as e:
        logger.error(f"Error processing token: {str(e)}")
        raise credentials_exception
    
    # Get user from database
    db = get_db()
    query = "SELECT id, username, email, is_admin FROM users WHERE id = %s AND username = %s"
    result = db.execute(query, (token_data.user_id, token_data.username))
    
    if not result:
        logger.warning(f"User not found in database: {token_data.username} (ID: {token_data.user_id})")
        raise credentials_exception
    
    logger.info(f"User authenticated via token: {result[0]['username']} (ID: {result[0]['id']})")
    return result[0]

async def get_optional_user(token: str = Depends(oauth2_scheme), request: Request = None) -> Optional[Dict[str, Any]]:
    """Get the current user if authenticated, or None"""
    try:
        if token or request:
            return await get_current_user(token, request)
        return None
    except HTTPException:
        return None

def init_auth_schema() -> None:
    """Initialize authentication schema"""
    # The admin user creation is now handled in db.py
    logger.info("Authentication schema initialization called")

# Admin-related functions
def is_admin(user: Dict[str, Any]) -> bool:
    """Check if a user is an admin"""
    return user.get('is_admin', False)

async def get_current_admin(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Get the current user and verify they're an admin"""
    if not is_admin(current_user):
        logger.warning(f"Admin access denied for user: {current_user.get('username')} (ID: {current_user.get('id')})")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized: Admin access required"
        )
    return current_user

def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    """Get a user by ID"""
    db = get_db()
    
    try:
        query = "SELECT id, username, email, is_admin FROM users WHERE id = %s"
        result = db.execute(query, (user_id,))
        
        return result[0] if result else None
    
    except Exception as e:
        logger.error(f"Error getting user by ID: {str(e)}")
        return None

def get_all_users() -> List[Dict[str, Any]]:
    """Get all users (admin only)"""
    db = get_db()
    
    try:
        query = "SELECT id, username, email, is_admin FROM users ORDER BY username"
        result = db.execute(query)
        
        return result or []
    
    except Exception as e:
        logger.error(f"Error getting all users: {str(e)}")
        return []

def update_user(user_id: int, data: Dict[str, Any]) -> bool:
    """Update a user (admin only or self)"""
    db = get_db()
    
    try:
        # Build the update query dynamically based on provided fields
        fields = []
        values = []
        
        if 'username' in data:
            fields.append("username = %s")
            values.append(data['username'])
        
        if 'email' in data:
            fields.append("email = %s")
            values.append(data['email'])
        
        if 'password' in data:
            fields.append("password_hash = %s")
            values.append(get_password_hash(data['password']))
        
        if 'is_admin' in data:
            fields.append("is_admin = %s")
            values.append(data['is_admin'])
        
        if not fields:
            logger.warning("No fields to update for user")
            return False
        
        # Add user_id to values
        values.append(user_id)
        
        # Build and execute the query
        query = f"UPDATE users SET {', '.join(fields)} WHERE id = %s"
        db.execute(query, tuple(values))
        
        return True
    
    except Exception as e:
        logger.error(f"Error updating user: {str(e)}")
        return False
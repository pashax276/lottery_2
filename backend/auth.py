import os
import logging
import jwt
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from db import get_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("powerball-auth")

SECRET_KEY = os.environ.get("JWT_SECRET", "your-secret-key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)

class Token(BaseModel):
    access_token: str
    token_type: str
    user_id: int
    username: str
    is_admin: bool

class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class User(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    is_admin: bool

async def authenticate_user(username: str, password: str) -> Optional[Dict[str, Any]]:
    try:
        db = get_db()
        user = db.execute(
            "SELECT id, username, email, password_hash, is_admin FROM users WHERE username = %s",
            (username,)
        )
        if not user:
            logger.warning(f"User not found: {username}")
            return None
        
        user = user[0]
        if not pwd_context.verify(password, user['password_hash']):
            logger.warning(f"Password verification failed for user: {username}")
            return None
        
        return {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "is_admin": user["is_admin"] if user["is_admin"] is not None else False
        }
    except Exception as e:
        logger.error(f"Error authenticating user {username}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Authentication error: {str(e)}")

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)) -> Dict[str, Any]:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        user_id = payload.get("user_id")
        is_admin = payload.get("is_admin", False)
        if username is None or user_id is None:
            logger.error("Invalid token: missing username or user_id")
            raise credentials_exception
        
        db = get_db()
        user = db.execute(
            "SELECT id, username, email, is_admin FROM users WHERE id = %s AND username = %s",
            (user_id, username)
        )
        if not user:
            logger.error(f"User not found: id={user_id}, username={username}")
            raise credentials_exception
        
        user = user[0]
        return {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "is_admin": user["is_admin"] if user["is_admin"] is not None else False
        }
    except jwt.PyJWTError as e:
        logger.error(f"JWT decode error: {str(e)}")
        raise credentials_exception

async def get_current_admin_user(current_user: Dict[str, Any] = Depends(get_current_user)):
    if not current_user.get("is_admin", False):
        logger.warning(f"Non-admin user {current_user['username']} attempted admin access")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can access this resource")
    return current_user

async def get_optional_user(token: str = Depends(oauth2_scheme)) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    try:
        return await get_current_user(token)
    except HTTPException:
        return None

def init_auth_schema():
    db = get_db()
    db._ensure_users()
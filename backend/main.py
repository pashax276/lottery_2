from fastapi import FastAPI, HTTPException, Depends, status, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator, Field
from typing import List, Optional, Dict, Any
from socketio import AsyncServer, ASGIApp
import os
import time
import logging
import asyncio
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
import jwt
import json
from passlib.context import CryptContext

from db import get_db
from scraper import PowerballScraper
from analytics import get_analytics
from auth import (
    Token, UserCreate, User, 
    authenticate_user, create_access_token,
    get_current_user, get_optional_user, init_auth_schema
)
from scheduler import PowerballScheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("data/logs/api.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("powerball-api")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class Draw(BaseModel):
    draw_number: int
    draw_date: str
    white_balls: List[int]
    powerball: int
    jackpot_amount: Optional[float] = 0
    winners: Optional[int] = 0
    
    @field_validator('white_balls')
    @classmethod
    def validate_white_balls(cls, v):
        if len(v) != 5:
            raise ValueError('Must provide exactly 5 white balls')
        if not all(1 <= x <= 69 for x in v):
            raise ValueError('White balls must be between 1 and 69')
        if len(set(v)) != 5:
            raise ValueError('White balls must be unique')
        return sorted(v)
    
    @field_validator('powerball')
    @classmethod
    def validate_powerball(cls, v):
        if not 1 <= v <= 26:
            raise ValueError('Powerball must be between 1 and 26')
        return v

class NumberCheck(BaseModel):
    user_id: Optional[int] = None
    draw_number: int
    numbers: List[List[int]]
    
    @field_validator('numbers')
    @classmethod
    def validate_numbers(cls, v):
        for nums in v:
            if len(nums) != 6:
                raise ValueError('Each set must provide exactly 6 numbers (5 white balls + 1 powerball)')
            if not all(1 <= x <= 69 for x in nums[:5]):
                raise ValueError('White balls must be between 1 and 69')
            if not 1 <= nums[5] <= 26:
                raise ValueError('Powerball must be between 1 and 26')
            if len(set(nums[:5])) != 5:
                raise ValueError('White balls must be unique')
        return v

class PredictionRequest(BaseModel):
    method: str = Field(..., description="Prediction method to use")
    user_id: Optional[int] = 1

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db = get_db()
    app.state.scraper = PowerballScraper()
    app.state.analytics = get_analytics()
    app.state.scheduler = PowerballScheduler()
    
    if not app.state.db.connect():
        logger.error("Failed to connect to database")
    else:
        app.state.db.init_schema()
        init_auth_schema()
        draws = app.state.db.get_draws(limit=1)
        if not draws:
            logger.info("No draws found, scraping historical draws...")
            try:
                historical_draws = await app.state.scraper.fetch_historical_draws(count=500)
                inserted_count = 0
                
                for draw_data in historical_draws:
                    try:
                        if not isinstance(draw_data, dict):
                            logger.error(f"Invalid draw data type: {type(draw_data)}")
                            continue
                            
                        if not all(k in draw_data for k in ['draw_number', 'draw_date', 'white_balls', 'powerball']):
                            logger.error(f"Missing required fields in draw data: {draw_data.keys()}")
                            continue
                        
                        white_balls = draw_data.get('white_balls', [])
                        if not isinstance(white_balls, list) or len(white_balls) != 5:
                            logger.error(f"Invalid white_balls format: {white_balls}")
                            continue
                            
                        if not all(isinstance(ball, int) and 1 <= ball <= 69 for ball in white_balls):
                            logger.error(f"Invalid white_balls values: {white_balls}")
                            continue
                            
                        powerball = draw_data.get('powerball')
                        if not isinstance(powerball, int) or not 1 <= powerball <= 26:
                            logger.error(f"Invalid powerball value: {powerball}")
                            continue
                            
                        draw_number = draw_data.get('draw_number')
                        if not isinstance(draw_number, int) or draw_number <= 0:
                            logger.error(f"Invalid draw_number: {draw_number}")
                            continue
                            
                        draw_date = draw_data.get('draw_date')
                        if not isinstance(draw_date, str) or not draw_date:
                            logger.error(f"Invalid draw_date: {draw_date}")
                            continue
                        
                        existing_draw = app.state.db.get_draw_by_number(draw_number)
                        if existing_draw:
                            logger.info(f"Draw {draw_number} already exists, skipping")
                            continue
                        
                        result = app.state.db.add_draw(
                            draw_number=draw_number,
                            draw_date=draw_date,
                            white_balls=white_balls,
                            powerball=powerball,
                            jackpot_amount=draw_data.get('jackpot_amount', 0),
                            winners=draw_data.get('winners', 0),
                            source=draw_data.get('source', 'api')
                        )
                        
                        if result:
                            inserted_count += 1
                            logger.info(f"Inserted draw {draw_number}")
                        
                    except Exception as e:
                        logger.error(f"Error inserting draw {draw_number}: {str(e)}")
                        continue
                
                logger.info(f"Populated {inserted_count} historical draws")
                
                final_count = len(app.state.db.get_draws(limit=1000))
                logger.info(f"Database contains {final_count} draws after population")
                
            except Exception as e:
                logger.error(f"Error populating historical draws: {str(e)}")
    
    if os.environ.get("ENABLE_SCHEDULER", "false").lower() == "true":
        logger.info("Starting scheduler...")
        asyncio.create_task(app.state.scheduler.start())
    
    yield
    
    logger.info("Shutting down...")
    
    if hasattr(app.state, "scheduler"):
        app.state.scheduler.stop()
    
    if hasattr(app.state, "db"):
        app.state.db.close()

sio = AsyncServer(async_mode='asgi', cors_allowed_origins='*')
app = FastAPI(
    title="Powerball Analyzer API",
    description="API for analyzing and predicting Powerball lottery results",
    version="1.0.0",
    lifespan=lifespan
)
socket_app = ASGIApp(sio)
app.mount("/socket.io", socket_app)
app.mount("/figures", StaticFiles(directory="data/figures"), name="figures")

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    
    logger.info(f"Request started: {request.method} {request.url.path}")
    
    if request.headers:
        logger.debug(f"Headers: {dict(request.headers)}")
    
    try:
        if request.method in ["POST", "PUT"] and request.headers.get("content-type") == "application/json":
            body = await request.body()
            if body:
                logger.debug(f"Request body: {body.decode('utf-8')[:1000]}")
            from starlette.datastructures import Headers
            from starlette.requests import Request as StarletteRequest
            request = StarletteRequest(
                scope=request.scope,
                receive=request.receive,
                send=request._send
            )
    except Exception as e:
        logger.error(f"Error logging request body: {e}")
    
    response = await call_next(request)
    
    process_time = time.time() - start_time
    logger.info(f"Request completed: {request.method} {request.url.path} - Status: {response.status_code} - Time: {process_time:.3f}s")
    
    return response

logger.info("Configuring CORS middleware")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
logger.info("CORS configured to allow all origins")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/token", auto_error=False)

DEBUG_NO_FALLBACK = os.environ.get("DEBUG_NO_FALLBACK", "false").lower() == "true"

# JWT configuration
SECRET_KEY = os.environ.get("JWT_SECRET", "your-secret-key")
ALGORITHM = "HS256"

async def get_current_admin_user(current_user: Dict[str, Any] = Depends(get_current_user)):
    if not current_user.get("is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can access this resource"
        )
    return current_user

@app.get("/")
async def read_root():
    return {
        "status": "ok", 
        "message": "Powerball Analysis API",
        "version": "1.0.0"
    }

@app.get("/api/health")
async def health_check():
    db = get_db()
    db_connected = db.connect()
    
    return {
        "status": "healthy" if db_connected else "degraded",
        "database": "connected" if db_connected else "disconnected",
        "timestamp": datetime.now().isoformat(),
    }

@app.post("/api/auth/register", response_model=User)
async def register_user(user_data: UserCreate):
    db = get_db()
    user = db.execute(
        """
        INSERT INTO users (username, email, password_hash, is_admin)
        VALUES (%s, %s, %s, %s)
        RETURNING id, username, email, is_admin
        """,
        (user_data.username, user_data.email, pwd_context.hash(user_data.password), False)
    )
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already exists"
        )
    
    return user[0]

@app.post("/api/auth/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    logger.info(f"Login attempt for user: {form_data.username}")
    
    try:
        user = await authenticate_user(form_data.username, form_data.password)
        
        if not user:
            logger.warning(f"Login failed for user: {form_data.username} - Invalid credentials")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        access_token_expires = timedelta(minutes=60 * 24)
        access_token = create_access_token(
            data={"sub": user["username"], "user_id": user["id"], "is_admin": user["is_admin"]},
            expires_delta=access_token_expires
        )
        
        logger.info(f"Login successful for user: {form_data.username}")
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user_id": user["id"],
            "username": user["username"],
            "is_admin": user["is_admin"]
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error for user {form_data.username}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during login"
        )

@app.get("/api/auth/me", response_model=User)
async def read_users_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    return current_user

@app.get("/api/draws")
async def get_draws(limit: int = 20, offset: int = 0, current_user: Dict[str, Any] = Depends(get_current_admin_user)):
    db = get_db()
    draws = db.get_draws(limit=limit, offset=offset)
    
    logger.debug(f"Raw draws from database: {draws}")
    
    for draw in draws:
        if draw['white_balls'] is None:
            logger.warning(f"Missing white_balls for draw {draw['draw_number']}")
            if not DEBUG_NO_FALLBACK:
                draw['white_balls'] = [1, 2, 3, 4, 5]
        if draw['powerball'] is None:
            logger.warning(f"Missing powerball for draw {draw['draw_number']}")
            if not DEBUG_NO_FALLBACK:
                draw['powerball'] = 1
    
    logger.info(f"Returning {len(draws)} draws for /api/draws with limit={limit}, offset={offset}")
    return {"success": True, "draws": draws, "count": len(draws)}

@app.get("/api/draws/latest")
async def get_latest_draw(current_user: Dict[str, Any] = Depends(get_current_admin_user)):
    db = get_db()
    draw = db.get_latest_draw()
    
    if not draw:
        raise HTTPException(status_code=404, detail="No draws available")
    
    logger.debug(f"Raw latest draw from database: {draw}")
    
    if draw['white_balls'] is None:
        logger.warning(f"Missing white_balls for latest draw {draw['draw_number']}")
        if not DEBUG_NO_FALLBACK:
            draw['white_balls'] = [1, 2, 3, 4, 5]
    if draw['powerball'] is None:
        logger.warning(f"Missing powerball for latest draw {draw['draw_number']}")
        if not DEBUG_NO_FALLBACK:
            draw['powerball'] = 1
    
    logger.debug(f"Processed latest draw for response: {draw}")
    return {"success": True, "draw": draw}

@app.get("/api/draws/{draw_number}")
async def get_draw_by_number(draw_number: int, current_user: Dict[str, Any] = Depends(get_current_admin_user)):
    db = get_db()
    draw = db.get_draw_by_number(draw_number)
    
    if not draw:
        raise HTTPException(status_code=404, detail=f"Draw {draw_number} not found")
    
    logger.debug(f"Raw draw {draw_number} from database: {draw}")
    
    if draw['white_balls'] is None:
        logger.warning(f"Missing white_balls for draw {draw_number}")
        if not DEBUG_NO_FALLBACK:
            draw['white_balls'] = [1, 2, 3, 4, 5]
    if draw['powerball'] is None:
        logger.warning(f"Missing powerball for draw {draw_number}")
        if not DEBUG_NO_FALLBACK:
            draw['powerball'] = 1
    
    logger.debug(f"Processed draw {draw_number} for response: {draw}")
    return {"success": True, "draw": draw}

@app.post("/api/draws/add")
async def add_draw(
    draw: Draw, 
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)
):
    db = get_db()
    
    logger.info(f"Adding draw: {draw.dict()}")
    
    user_id = 1
    if current_user:
        user_id = current_user.get("id", 1) if current_user else 1
    
    try:
        result = db.add_draw(
            draw_number=draw.draw_number,
            draw_date=draw.draw_date,
            white_balls=draw.white_balls,
            powerball=draw.powerball,
            jackpot_amount=draw.jackpot_amount,
            winners=draw.winners,
            source='api'
        )
        
        if not result:
            logger.error(f"Failed to add draw {draw.draw_number}")
            if not db.connect():
                logger.error("Database connection failed")
                raise HTTPException(status_code=500, detail="Database connection failed")
            raise HTTPException(status_code=400, detail=f"Failed to add draw {draw.draw_number}: Draw may already exist or invalid data provided")
        
        await sio.emit('new_draw', result)
        
        if user_id > 0:
            try:
                db.update_user_stat(user_id, 'draws_added')
            except Exception as e:
                logger.error(f"Failed to update user stats: {str(e)}")
        
        logger.info(f"Successfully added draw {draw.draw_number}: {result}")
        return {"success": True, "draw": result}
    
    except Exception as e:
        logger.exception(f"Exception adding draw {draw.draw_number}: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error adding draw: {str(e)}")

@app.post("/api/check_numbers")
async def check_numbers(
    check: NumberCheck,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)
):
    db = get_db()
    
    user_id = check.user_id or 1
    if current_user:
        if current_user.get("is_admin", False) and check.user_id:
            # Admin can specify any user_id
            user_id = check.user_id
            # Verify user exists
            user = db.execute("SELECT id, username FROM users WHERE id = %s", (user_id,))
            if not user:
                raise HTTPException(status_code=400, detail=f"User ID {user_id} does not exist")
            username = user[0]['username']
        else:
            # Non-admin uses their own user_id
            user_id = current_user.get("id", 1)
            username = current_user.get("username", 'anonymous')
    else:
        username = 'anonymous'
    
    draw = db.get_draw_by_number(check.draw_number)
    
    if not draw:
        raise HTTPException(status_code=404, detail="Draw not found")
    
    results = []
    for numbers in check.numbers:
        white_balls_to_check = numbers[:5]
        powerball_to_check = numbers[5]
        
        white_matches = [n for n in white_balls_to_check if n in draw["white_balls"]]
        powerball_match = powerball_to_check == draw["powerball"]
        
        prize = "No Prize"
        is_winner = False
        prize_amount = 0
        
        if powerball_match and len(white_matches) == 5:
            prize = "JACKPOT WINNER!"
            is_winner = True
            prize_amount = draw.get('jackpot_amount', 0)
        elif len(white_matches) == 5:
            prize = "$1,000,000"
            is_winner = True
            prize_amount = 1000000
        elif len(white_matches) == 4 and powerball_match:
            prize = "$50,000"
            is_winner = True
            prize_amount = 50000
        elif len(white_matches) == 4 or (len(white_matches) == 3 and powerball_match):
            prize = "$100"
            is_winner = True
            prize_amount = 100
        elif len(white_matches) == 3 or (len(white_matches) == 2 and powerball_match):
            prize = "$7"
            is_winner = True
            prize_amount = 7
        elif len(white_matches) == 1 and powerball_match:
            prize = "$4"
            is_winner = True
            prize_amount = 4
        elif powerball_match:
            prize = "$4"
            is_winner = True
            prize_amount = 4
        
        check_result = db.add_user_check(
            user_id=user_id,
            draw_id=draw["id"],
            numbers=numbers,
            white_matches=white_matches,
            powerball_match=powerball_match,
            is_winner=is_winner,
            prize=prize,
            prize_amount=prize_amount
        )
        
        result = {
            "user_id": user_id,
            "username": username,
            "draw_number": draw["draw_number"],
            "draw_date": draw["draw_date"],
            "numbers": numbers,
            "matches": {
                "white_balls": white_matches,
                "powerball": powerball_to_check if powerball_match else None,
                "is_winner": is_winner
            },
            "message": f"Matched {len(white_matches)} white ball{'s' if len(white_matches) != 1 else ''}" +
                      (f" and the Powerball" if powerball_match else "") +
                      f" - {prize}",
            "timestamp": check_result['created_at'].isoformat()
        }
        results.append(result)
    
    await sio.emit('new_check', {'user_id': user_id, 'draw_number': check.draw_number})
    return {"success": True, "results": results}

@app.post("/api/predictions")
async def generate_prediction(
    request: PredictionRequest,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    db = get_db()
    analytics = get_analytics()
    
    user_id = request.user_id or 1
    if current_user:
        user_id = current_user.get("id", 1) if current_user else 1
    
    if request.method.lower() == 'machine-learning':
        background_tasks.add_task(run_analytics_tasks)
    
    predictions = analytics.generate_ml_prediction() if request.method.lower() == 'machine-learning' else analytics.generate_pattern_prediction()
    
    unique_predictions = []
    seen = set()
    for pred in predictions:
        key = (tuple(pred['white_balls']), pred['powerball'])
        if key not in seen:
            seen.add(key)
            unique_predictions.append(pred)
    
    db_predictions = []
    for prediction in unique_predictions:
        prediction['user_id'] = user_id
        db_prediction = db.add_prediction(
            white_balls=prediction["white_balls"],
            powerball=prediction["powerball"],
            method=prediction["method"],
            confidence=prediction["confidence"],
            rationale=prediction["rationale"],
            user_id=user_id
        )
        db.save_analysis_result('prediction', prediction)
        db_predictions.append(db_prediction)
    
    return {"success": True, "predictions": db_predictions}

@app.get("/api/predictions")
async def get_predictions(
    method: Optional[str] = None,
    user_id: Optional[int] = None,
    limit: int = 10, 
    offset: int = 0,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)
):
    db = get_db()
    
    user_id = None
    if current_user:
        user_id = current_user.get("id", None) if current_user else None
    
    predictions = db.get_predictions(
        method=method,
        user_id=user_id,
        limit=limit,
        offset=offset
    )
    
    return predictions or []

@app.get("/api/insights/frequency")
async def get_frequency_analysis(current_user: Dict[str, Any] = Depends(get_current_admin_user)):
    db = get_db()
    frequency = db.get_frequency_analysis()
    
    return frequency

@app.get("/api/insights/due")
async def get_due_numbers(current_user: Dict[str, Any] = Depends(get_current_admin_user)):
    analytics = get_analytics()
    db = get_db()
    
    try:
        results = db.get_analysis_results('due_numbers', limit=1)
        
        if results:
            return results[0]['result_data']
        
        freq = db.get_frequency_analysis()
        
        white_freq = [(int(num), freq) for num, freq in freq['white_balls'].items()]
        pb_freq = [(int(num), freq) for num, freq in freq['powerballs'].items()]
        
        white_freq.sort(key=lambda x: x[1])
        pb_freq.sort(key=lambda x: x[1])
        
        due_white = white_freq[:10]
        due_pb = pb_freq[:5]
        
        result = {
            "white_balls": {str(num): freq for num, freq in due_white},
            "powerballs": {str(num): freq for num, freq in due_pb}
        }
        
        db.save_analysis_result('due_numbers', result)
        
        return result
    
    except Exception as e:
        logger.error(f"Error getting due numbers: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/insights/hot")
async def get_hot_numbers(current_user: Dict[str, Any] = Depends(get_current_admin_user)):
    analytics = get_analytics()
    db = get_db()
    
    try:
        results = db.get_analysis_results('hot_numbers', limit=1)
        
        if results:
            return results[0]['result_data']
        
        freq = db.get_frequency_analysis()
        
        white_freq = [(int(num), freq) for num, freq in freq['white_balls'].items()]
        pb_freq = [(int(num), freq) for num, freq in freq['powerballs'].items()]
        
        white_freq.sort(key=lambda x: x[1], reverse=True)
        pb_freq.sort(key=lambda x: x[1], reverse=True)
        
        hot_white = white_freq[:10]
        hot_pb = pb_freq[:5]
        
        result = {
            "white_balls": {str(num): freq for num, freq in hot_white},
            "powerballs": {str(num): freq for num, freq in hot_pb}
        }
        
        db.save_analysis_result('hot_numbers', result)
        
        return result
    
    except Exception as e:
        logger.error(f"Error getting hot numbers: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/insights/pairs")
async def get_pair_analysis(current_user: Dict[str, Any] = Depends(get_current_admin_user)):
    db = get_db()
    
    try:
        results = db.get_analysis_results('pair_analysis', limit=1)
        
        if results:
            return results[0]['result_data']
        
        draws = db.get_draws(limit=1000)
        if not draws:
            return {"common_pairs": []}
        
        from collections import Counter
        pairs_counter = Counter()
        
        for draw in draws:
            white_balls = draw["white_balls"] if 'white_balls' in draw and draw['white_balls'] else []
            for i in range(len(white_balls)):
                for j in range(i + 1, len(white_balls)):
                    pair = tuple(sorted([white_balls[i], white_balls[j]]))
                    pairs_counter[pair] += 1
        
        common_pairs = pairs_counter.most_common(15)
        
        result = {
            "common_pairs": [{"pair": list(pair), "count": count} for pair, count in common_pairs]
        }
        
        db.save_analysis_result('pair_analysis', result)
        
        return result
    
    except Exception as e:
        logger.error(f"Error in pair analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ideas")
async def get_ideas(current_user: Dict[str, Any] = Depends(get_current_admin_user)):
    return {
        "ideas": [
            {"id": 1, "title": "Implement user authentication", "description": "Add JWT-based authentication for secure user access."},
            {"id": 2, "title": "Enhance analytics dashboard", "description": "Create interactive charts for draw statistics."},
            {"id": 3, "title": "Add prediction history", "description": "Store and display past predictions for users."},
        ]
    }

@app.get("/api/insights/positions")
async def get_position_analysis(current_user: Dict[str, Any] = Depends(get_current_admin_user)):
    db = get_db()
    
    try:
        results = db.get_analysis_results('position_analysis', limit=1)
        
        if results:
            return results[0]['result_data']
        
        draws = db.get_draws(limit=1000)
        
        if not draws:
            return {"positions": []}
        
        from collections import Counter
        position_counters = [Counter() for _ in range(5)]
        
        for draw in draws:
            white_balls = draw["white_balls"] if 'white_balls' in draw and draw['white_balls'] else []
            for i in range(min(5, len(white_balls))):
                position_counters[i][white_balls[i]] += 1
        
        position_analysis = []
        
        for i, counter in enumerate(position_counters):
            top_numbers = counter.most_common(5)
            position_analysis.append({
                "position": i + 1,
                "top_numbers": [{"number": num, "count": count} for num, count in top_numbers]
            })
        
        result = {"positions": position_analysis}
        
        db.save_analysis_result('position_analysis', result)
        
        return result
    
    except Exception as e:
        logger.error(f"Error in position analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/insights/cluster")
async def get_cluster_analysis(
    force_refresh: bool = False,
    current_user: Dict[str, Any] = Depends(get_current_admin_user)
):
    analytics = get_analytics()
    db = get_db()
    
    try:
        if not force_refresh:
            results = db.get_analysis_results('cluster_analysis', limit=1)
            
            if results:
                return results[0]['result_data']
        
        result = analytics.cluster_analysis()
        
        return result
    
    except Exception as e:
        logger.error(f"Error in cluster analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/insights/all")
async def get_all_insights(current_user: Dict[str, Any] = Depends(get_current_admin_user)):
    db = get_db()
    analytics = get_analytics()
    
    try:
        summary = analytics.get_analysis_summary()
        
        if not summary.get('success', False):
            raise HTTPException(status_code=500, detail=summary.get('message', 'Unknown error'))
        
        return summary['summary']
    
    except Exception as e:
        logger.error(f"Error generating insights: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analytics/run")
async def run_analytics(
    background_tasks: BackgroundTasks,
    current_user: Dict[str, Any] = Depends(get_current_admin_user)
):
    background_tasks.add_task(run_analytics_tasks)
    
    return {
        "success": True, 
        "message": "Analytics tasks scheduled"
    }

@app.get("/api/combinations")
async def get_top_combinations(limit: int = 10, current_user: Dict[str, Any] = Depends(get_current_admin_user)):
    db = get_db()
    combinations = db.get_expected_combinations(limit=limit)
    
    return combinations

@app.post("/api/combinations/update")
async def update_combinations(
    background_tasks: BackgroundTasks,
    current_user: Dict[str, Any] = Depends(get_current_admin_user)
):
    background_tasks.add_task(update_combinations_task)
    
    return {
        "success": True, 
        "message": "Combinations update scheduled"
    }

@app.get("/api/user_stats")
async def get_user_statistics(current_user: Dict[str, Any] = Depends(get_current_admin_user)):
    db = get_db()
    
    try:
        stats = db.execute("""
            SELECT 
                u.id as user_id,
                u.username,
                COALESCE(COUNT(uc.id), 0) as total_checks,
                COALESCE(SUM(ARRAY_LENGTH(uc.white_matches, 1) + (CASE WHEN uc.powerball_match THEN 1 ELSE 0 END)), 0) as total_matches,
                COALESCE(SUM(CASE WHEN uc.is_winner THEN 1 ELSE 0 END), 0) as total_wins,
                COALESCE(SUM(uc.prize_amount), 0) as total_prize
            FROM users u
            LEFT JOIN user_checks uc ON u.id = uc.user_id
            GROUP BY u.id, u.username
            ORDER BY total_matches DESC, total_wins DESC, total_prize DESC
        """)
        return stats
    except Exception as e:
        logger.error(f"Error fetching user stats: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching user stats: {str(e)}")

@app.get("/api/user_checks")
async def get_user_checks(
    limit: int = 10,
    offset: int = 0,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)
):
    db = get_db()
    
    user_id = 1
    if current_user:
        user_id = current_user.get("id", 1) if current_user else 1
    
    checks = db.get_user_checks(user_id, limit=limit, offset=offset)
    
    return {"success": True, "checks": checks, "total": len(checks)}

@app.get("/api/users")
async def get_all_users(current_user: Dict[str, Any] = Depends(get_current_admin_user)):
    db = get_db()
    users = db.get_all_users()
    return {"success": True, "users": users}

@app.post("/api/db/reset")
async def reset_database_schema(current_user: Dict[str, Any] = Depends(get_current_admin_user)):
    try:
        db = get_db()
        
        if not db.connect():
            raise HTTPException(status_code=500, detail="Failed to connect to database")
        
        logger.info("Resetting database schema...")
        
        schema_path = os.path.join(os.path.dirname(__file__), 'schema.sql')
        
        if not os.path.exists(schema_path):
            raise HTTPException(status_code=500, detail=f"Schema file not found at {schema_path}")
        
        with open(schema_path, 'r') as f:
            schema_sql = f.read()
        
        db.execute(schema_sql)
        
        init_auth_schema()
        
        logger.info("Database schema reset completed successfully")
        
        return {"success": True, "message": "Database schema reset completed successfully"}
        
    except Exception as e:
        logger.error(f"Error resetting database schema: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error resetting database schema: {str(e)}")

@app.get("/api/debug/test")
async def debug_test(current_user: Dict[str, Any] = Depends(get_current_admin_user)):
    logger.info("Debug test endpoint called")
    
    db = get_db()
    db_connected = db.connect()
    
    draw_count = 0
    if db_connected:
        try:
            draws = db.get_draws(limit=1)
            draw_count = len(draws)
        except Exception as e:
            logger.error(f"Error getting draws in debug endpoint: {e}")
    
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "database_connected": db_connected,
        "draw_count": draw_count,
        "message": "Debug endpoint working"
    }

async def run_analytics_tasks():
    try:
        analytics = get_analytics()
        logger.info("Running analytics tasks...")
        
        result = analytics.run_all_analyses()
        
        if result.get('success', False):
            logger.info("Analytics tasks completed successfully")
        else:
            logger.error(f"Analytics tasks failed: {result.get('message', 'Unknown error')}")
    
    except Exception as e:
        logger.error(f"Error in analytics tasks: {str(e)}")

async def update_combinations_task():
    try:
        analytics = get_analytics()
        db = get_db()
        
        logger.info("Updating expected combinations...")
        
        db.clear_expected_combinations()
        
        predictions = analytics.generate_ml_prediction()
        
        for prediction in predictions:
            db.add_expected_combination(
                white_balls=prediction["white_balls"],
                powerball=prediction["powerball"],
                score=prediction["confidence"],
                method=prediction["method"],
                reason=prediction["rationale"]
            )
        
        predictions = analytics.generate_pattern_prediction()
        
        for prediction in predictions:
            db.add_expected_combination(
                white_balls=prediction["white_balls"],
                powerball=prediction["powerball"],
                score=prediction["confidence"],
                method=prediction["method"],
                reason=prediction["rationale"]
            )
        
        logger.info("Combinations updated successfully")
    
    except Exception as e:
        logger.error(f"Error updating combinations: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    
    os.makedirs("data/logs", exist_ok=True)
    
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=int(os.environ.get("PORT", 5001)),
        log_level=os.environ.get("LOG_LEVEL", "info").lower()
    )
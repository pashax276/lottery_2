from fastapi import FastAPI, HTTPException, Depends, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, field_validator, Field
from typing import List, Optional, Dict, Any, Union
import os
import logging
from logger_config import get_logger
import asyncio
from datetime import datetime, timedelta
from contextlib import asynccontextmanager

from db import get_db
from scraper import PowerballScraper
from analytics import get_analytics
from auth import (
    Token, UserCreate, UserLogin, User, 
    create_user, authenticate_user, create_access_token,
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
logger = get_logger("powerball-api")

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
    user_id: Optional[int] = 1
    draw_number: int
    numbers: List[int]
    
    @field_validator('numbers')
    @classmethod
    def validate_numbers(cls, v):
        if len(v) != 6:
            raise ValueError('Must provide exactly 6 numbers (5 white balls + 1 powerball)')
        if not all(1 <= x <= 69 for x in v[:5]):
            raise ValueError('White balls must be between 1 and 69')
        if not 1 <= v[5] <= 26:
            raise ValueError('Powerball must be between 1 and 26')
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
    
    if os.environ.get("ENABLE_SCHEDULER", "false").lower() == "true":
        logger.info("Starting scheduler...")
        asyncio.create_task(app.state.scheduler.start())
    
    yield
    
    logger.info("Shutting down...")
    if hasattr(app.state, "scheduler"):
        app.state.scheduler.stop()
    if hasattr(app.state, "db"):
        app.state.db.close()

app = FastAPI(
    title="Powerball Analyzer API",
    description="API for analyzing and predicting Powerball lottery results",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/token", auto_error=False)

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

@app.get("/api/health/db")
async def db_health_check():
    db = get_db()
    try:
        result = db.execute("SELECT 1 AS test")
        schema_check = db.execute("SELECT * FROM draws LIMIT 1")
        return {
            "status": "healthy",
            "connection": "ok",
            "schema": "ok" if schema_check is not None else "error",
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Database health check failed: {str(e)}")
        return {"status": "error", "connection": str(e), "timestamp": datetime.now().isoformat()}

@app.post("/api/auth/register", response_model=User)
async def register_user(user_data: UserCreate):
    try:
        user = create_user(user_data)
        if not user:
            logger.warning(f"Failed to register user: Username {user_data.username} already exists")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already exists"
            )
        logger.info(f"Successfully registered user: {user_data.username}")
        return user
    except Exception as e:
        logger.error(f"Error registering user: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to register user")

@app.post("/api/auth/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    try:
        user = authenticate_user(form_data.username, form_data.password)
        if not user:
            logger.warning(f"Failed login attempt for username: {form_data.username}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        access_token_expires = timedelta(minutes=60 * 24)
        access_token = create_access_token(
            data={"sub": user["username"], "user_id": user["id"]},
            expires_delta=access_token_expires
        )
        
        logger.info(f"Successful login for username: {form_data.username}")
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user_id": user["id"],
            "username": user["username"]
        }
    except Exception as e:
        logger.error(f"Error during login: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to authenticate")

@app.get("/api/auth/me", response_model=User)
async def read_users_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    try:
        logger.debug(f"Fetching current user: {current_user['username']}")
        return current_user
    except Exception as e:
        logger.error(f"Error fetching current user: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch user")

@app.get("/api/draws")
async def get_draws(limit: int = 20, offset: int = 0):
    db = get_db()
    logger.debug(f"Fetching draws with limit={limit}, offset={offset}")
    try:
        draws = db.get_draws(limit=limit, offset=offset)
        return {"success": True, "draws": draws, "count": len(draws)}
    except Exception as e:
        logger.error(f"Error fetching draws: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch draws: {str(e)}")

@app.get("/api/draws/latest")
async def get_latest_draw():
    db = get_db()
    logger.debug("Fetching latest draw")
    try:
        draw = db.get_latest_draw()
        if not draw:
            logger.warning("No draws available")
            raise HTTPException(status_code=404, detail="No draws available")
        return {"success": True, "draw": draw}
    except Exception as e:
        logger.error(f"Error fetching latest draw: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch latest draw: {str(e)}")

@app.get("/api/draws/{draw_number}")
async def get_draw_by_number(draw_number: int):
    db = get_db()
    logger.debug(f"Fetching draw number {draw_number}")
    try:
        draw = db.get_draw_by_number(draw_number)
        if not draw:
            logger.warning(f"Draw {draw_number} not found")
            raise HTTPException(status_code=404, detail=f"Draw {draw_number} not found")
        return {"success": True, "draw": draw}
    except Exception as e:
        logger.error(f"Error fetching draw #{draw_number}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch draw {draw_number}: {str(e)}")

@app.post("/api/draws/add")
async def add_draw(
    draw: Draw, 
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    db = get_db()
    logger.info(f"Attempting to add draw #{draw.draw_number} on {draw.draw_date} with white_balls={draw.white_balls}, powerball={draw.powerball}, jackpot_amount={draw.jackpot_amount}, winners={draw.winners}")
    
    try:
        existing_draw = db.get_draw_by_number(draw.draw_number)
        if existing_draw:
            logger.warning(f"Draw {draw.draw_number} already exists in database")
            raise HTTPException(status_code=400, detail=f"Draw {draw.draw_number} already exists")
        
        if not db.connect():
            logger.error("Failed to connect to database")
            raise HTTPException(status_code=500, detail="Database connection error")
        
        logger.debug(f"Validated draw data: white_balls length={len(draw.white_balls)}, powerball={draw.powerball}")
        
        result = db.add_draw(
            draw_number=draw.draw_number,
            draw_date=draw.draw_date,
            white_balls=draw.white_balls,
            powerball=draw.powerball,
            jackpot_amount=draw.jackpot_amount,
            winners=draw.winners
        )
        
        if not result:
            logger.error(f"Failed to add draw #{draw.draw_number} to database")
            raise HTTPException(status_code=500, detail=f"Failed to add draw {draw.draw_number} to database")
        
        verification = db.get_draw_by_number(draw.draw_number)
        if not verification:
            logger.error(f"Verification failed: Draw #{draw.draw_number} not found after insertion")
            raise HTTPException(status_code=500, detail=f"Draw {draw.draw_number} not added successfully")
        
        logger.info(f"Successfully added draw #{draw.draw_number}")
        return {"success": True, "draw": result}
        
    except Exception as e:
        logger.error(f"Error adding draw #{draw.draw_number}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error adding draw {draw.draw_number}: {str(e)}")

@app.post("/api/check_numbers")
async def check_numbers(
    check: NumberCheck,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)
):
    db = get_db()
    user_id = current_user["id"] if current_user else 1
    
    try:
        draw = db.get_draw_by_number(check.draw_number)
        if not draw:
            logger.warning(f"Draw {check.draw_number} not found for number check")
            raise HTTPException(status_code=404, detail="Draw not found")
        
        white_balls_to_check = check.numbers[:5]
        powerball_to_check = check.numbers[5]
        
        white_matches = [n for n in white_balls_to_check if n in draw["white_balls"]]
        powerball_match = powerball_to_check == draw["powerball"]
        
        prize = "No Prize"
        is_winner = False
        
        if powerball_match and len(white_matches) == 5:
            prize = "JACKPOT WINNER!"
            is_winner = True
        elif len(white_matches) == 5:
            prize = "$1,000,000"
            is_winner = True
        elif len(white_matches) == 4 and powerball_match:
            prize = "$50,000"
            is_winner = True
        elif len(white_matches) == 4 or (len(white_matches) == 3 and powerball_match):
            prize = "$100"
            is_winner = True
        elif len(white_matches) == 3 or (len(white_matches) == 2 and powerball_match):
            prize = "$7"
            is_winner = True
        elif len(white_matches) == 1 and powerball_match:
            prize = "$4"
            is_winner = True
        elif powerball_match:
            prize = "$4"
            is_winner = True
        
        check_result = db.add_user_check(
            user_id=user_id,
            draw_id=draw["id"],
            numbers=check.numbers,
            white_matches=white_matches,
            powerball_match=powerball_match,
            is_winner=is_winner,
            prize=prize
        )
        
        result = {
            "user_id": user_id,
            "draw_number": draw["draw_number"],
            "draw_date": draw["draw_date"],
            "numbers": check.numbers,
            "matches": {
                "white_balls": white_matches,
                "powerball": powerball_to_check if powerball_match else None,
                "is_winner": is_winner
            },
            "message": f"Matched {len(white_matches)} white ball{'s' if len(white_matches) != 1 else ''}" +
                      (f" and the Powerball" if powerball_match else "") +
                      f" - {prize}",
            "timestamp": datetime.now().isoformat()
        }
        
        logger.info(f"Number check completed for draw #{check.draw_number}, user_id={user_id}")
        return {"success": True, "result": result}
    except Exception as e:
        logger.error(f"Error checking numbers for draw #{check.draw_number}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to check numbers: {str(e)}")

@app.post("/api/scrape/latest")
async def scrape_latest(
    background_tasks: BackgroundTasks,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)
):
    scraper = PowerballScraper()
    db = get_db()
    
    try:
        draw_data = await scraper.fetch_latest_draw()
        if not draw_data:
            logger.warning("No data found for latest draw scrape")
            raise HTTPException(status_code=404, detail="No data found")
        
        existing_draw = db.get_draw_by_number(draw_data['draw_number'])
        if existing_draw:
            logger.info(f"Draw {draw_data['draw_number']} already exists during scrape")
            return {"success": True, "message": "Draw already exists", "draw": existing_draw}
        
        new_draw = db.add_draw(
            draw_number=draw_data['draw_number'],
            draw_date=draw_data['draw_date'],
            white_balls=draw_data['white_balls'],
            powerball=draw_data['powerball'],
            jackpot_amount=draw_data['jackpot_amount'],
            winners=draw_data['winners']
        )
        
        if not new_draw:
            logger.error(f"Failed to add scraped draw #{draw_data['draw_number']} to database")
            raise HTTPException(status_code=500, detail="Failed to add draw to database")
        
        background_tasks.add_task(run_analytics_tasks)
        logger.info(f"Successfully scraped and added draw #{draw_data['draw_number']}")
        return {"success": True, "draw": new_draw}
            
    except Exception as e:
        logger.error(f"Error scraping latest draw: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error scraping latest draw: {str(e)}")

@app.post("/api/scrape/historical")
async def scrape_historical(
    background_tasks: BackgroundTasks,
    count: int = 20,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    scraper = PowerballScraper()
    db = get_db()
    
    try:
        draws = await scraper.fetch_historical_draws(count=count)
        if not draws:
            logger.warning("No historical draws found")
            raise HTTPException(status_code=404, detail="No historical draws found")
        
        new_draws = []
        for draw_data in draws:
            existing = db.get_draw_by_number(draw_data['draw_number'])
            if existing:
                logger.debug(f"Draw {draw_data['draw_number']} already exists, skipping")
                continue
                
            new_draw = db.add_draw(
                draw_number=draw_data['draw_number'],
                draw_date=draw_data['draw_date'],
                white_balls=draw_data['white_balls'],
                powerball=draw_data['powerball'],
                jackpot_amount=draw_data['jackpot_amount'],
                winners=draw_data['winners']
            )
            
            if new_draw:
                new_draws.append(new_draw)
        
        if new_draws:
            background_tasks.add_task(run_analytics_tasks)
            logger.info(f"Successfully added {len(new_draws)} historical draws")
        
        return {"success": True, "draws": new_draws, "count": len(new_draws)}
        
    except Exception as e:
        logger.error(f"Error scraping historical draws: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error scraping historical draws: {str(e)}")

@app.post("/api/predictions")
async def generate_prediction(
    request: PredictionRequest,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)
):
    db = get_db()
    analytics = get_analytics()
    
    user_id = current_user["id"] if current_user else 1
    
    try:
        prediction = None
        if request.method.lower() == 'machine-learning':
            prediction = analytics.generate_ml_prediction()
        else:
            prediction = analytics.generate_pattern_prediction()
        
        prediction["user_id"] = user_id
        
        db_prediction = db.add_prediction(
            white_balls=prediction["white_balls"],
            powerball=prediction["powerball"],
            method=prediction["method"],
            confidence=prediction["confidence"],
            rationale=prediction["rationale"],
            user_id=user_id
        )
        
        db.save_analysis_result('prediction', prediction)
        logger.info(f"Generated prediction for user_id={user_id}, method={request.method}")
        return {"success": True, "prediction": prediction}
    except Exception as e:
        logger.error(f"Error generating prediction: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate prediction: {str(e)}")

@app.get("/api/predictions")
async def get_predictions(
    method: Optional[str] = None,
    limit: int = 10, 
    offset: int = 0,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)
):
    db = get_db()
    user_id = current_user["id"] if current_user else None
    
    try:
        predictions = db.get_predictions(
            method=method,
            user_id=user_id,
            limit=limit,
            offset=offset
        )
        logger.debug(f"Fetched {len(predictions)} predictions with method={method}, user_id={user_id}")
        return predictions
    except Exception as e:
        logger.error(f"Error fetching predictions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch predictions: {str(e)}")

@app.get("/api/insights/frequency")
async def get_frequency_analysis():
    db = get_db()
    try:
        frequency = db.get_frequency_analysis()
        logger.debug("Fetched frequency analysis")
        return frequency
    except Exception as e:
        logger.error(f"Error fetching frequency analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch frequency analysis: {str(e)}")

@app.get("/api/insights/due")
async def get_due_numbers():
    analytics = get_analytics()
    db = get_db()
    
    try:
        results = db.get_analysis_results('due_numbers', limit=1)
        if results:
            logger.debug("Returning cached due numbers analysis")
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
        logger.debug("Generated and cached due numbers analysis")
        return result
    
    except Exception as e:
        logger.error(f"Error getting due numbers: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch due numbers: {str(e)}")

@app.get("/api/insights/hot")
async def get_hot_numbers():
    analytics = get_analytics()
    db = get_db()
    
    try:
        results = db.get_analysis_results('hot_numbers', limit=1)
        if results:
            logger.debug("Returning cached hot numbers analysis")
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
        logger.debug("Generated and cached hot numbers analysis")
        return result
    
    except Exception as e:
        logger.error(f"Error getting hot numbers: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch hot numbers: {str(e)}")

@app.get("/api/insights/pairs")
async def get_pair_analysis():
    db = get_db()
    
    try:
        results = db.get_analysis_results('pair_analysis', limit=1)
        if results:
            logger.debug("Returning cached pair analysis")
            return results[0]['result_data']
        
        draws = db.get_draws(limit=1000)
        if not draws:
            logger.debug("No draws available for pair analysis")
            return {"common_pairs": []}
        
        from collections import Counter
        pairs_counter = Counter()
        
        for draw in draws:
            white_balls = draw["white_balls"]
            for i in range(len(white_balls)):
                for j in range(i + 1, len(white_balls)):
                    pair = tuple(sorted([white_balls[i], white_balls[j]]))
                    pairs_counter[pair] += 1
        
        common_pairs = pairs_counter.most_common(15)
        result = {
            "common_pairs": [{"pair": list(pair), "count": count} for pair, count in common_pairs]
        }
        
        db.save_analysis_result('pair_analysis', result)
        logger.debug("Generated and cached pair analysis")
        return result
    
    except Exception as e:
        logger.error(f"Error in pair analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch pair analysis: {str(e)}")

@app.get("/api/insights/positions")
async def get_position_analysis():
    db = get_db()
    
    try:
        results = db.get_analysis_results('position_analysis', limit=1)
        if results:
            logger.debug("Returning cached position analysis")
            return results[0]['result_data']
        
        draws = db.get_draws(limit=1000)
        if not draws:
            logger.debug("No draws available for position analysis")
            return {"positions": []}
        
        from collections import Counter
        position_counters = [Counter() for _ in range(5)]
        
        for draw in draws:
            white_balls = draw["white_balls"]
            for i in range(5):
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
        logger.debug("Generated and cached position analysis")
        return result
    
    except Exception as e:
        logger.error(f"Error in position analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch position analysis: {str(e)}")

@app.get("/api/insights/cluster")
async def get_cluster_analysis(
    force_refresh: bool = False,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    analytics = get_analytics()
    db = get_db()
    
    try:
        if not force_refresh:
            results = db.get_analysis_results('cluster_analysis', limit=1)
            if results:
                logger.debug("Returning cached cluster analysis")
                return results[0]['result_data']
        
        result = analytics.cluster_analysis()
        logger.debug("Generated cluster analysis")
        return result
    
    except Exception as e:
        logger.error(f"Error in cluster analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch cluster analysis: {str(e)}")

@app.get("/api/insights/all")
async def get_all_insights():
    db = get_db()
    analytics = get_analytics()
    
    try:
        summary = analytics.get_analysis_summary()
        if not summary.get('success', False):
            logger.error(f"Analysis summary failed: {summary.get('message', 'Unknown error')}")
            raise HTTPException(status_code=500, detail=summary.get('message', 'Unknown error'))
        
        logger.debug("Fetched all insights summary")
        return summary['summary']
    
    except Exception as e:
        logger.error(f"Error generating insights: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch insights: {str(e)}")

@app.post("/api/analytics/run")
async def run_analytics(
    background_tasks: BackgroundTasks,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    try:
        background_tasks.add_task(run_analytics_tasks)
        logger.info("Scheduled analytics tasks")
        return {
            "success": True, 
            "message": "Analytics tasks scheduled"
        }
    except Exception as e:
        logger.error(f"Error scheduling analytics tasks: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to schedule analytics: {str(e)}")

@app.get("/api/combinations")
async def get_top_combinations(limit: int = 10):
    db = get_db()
    try:
        combinations = db.get_expected_combinations(limit=limit)
        logger.debug(f"Fetched {len(combinations)} top combinations")
        return combinations
    except Exception as e:
        logger.error(f"Error fetching top combinations: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch combinations: {str(e)}")

@app.post("/api/combinations/update")
async def update_combinations(
    background_tasks: BackgroundTasks,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    try:
        background_tasks.add_task(update_combinations_task)
        logger.info("Scheduled combinations update")
        return {
            "success": True, 
            "message": "Combinations update scheduled"
        }
    except Exception as e:
        logger.error(f"Error scheduling combinations update: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to schedule combinations update: {str(e)}")

@app.get("/api/user_stats")
async def get_user_statistics(
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)
):
    db = get_db()
    user_id = current_user["id"] if current_user else 1
    
    try:
        stats = db.get_user_stats(user_id)
        logger.debug(f"Fetched user stats for user_id={user_id}")
        return stats
    except Exception as e:
        logger.error(f"Error fetching user stats for user_id={user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch user stats: {str(e)}")

@app.get("/api/user_checks")
async def get_user_checks(
    limit: int = 10,
    offset: int = 0,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)
):
    db = get_db()
    user_id = current_user["id"] if current_user else 1
    
    try:
        checks = db.get_user_checks(user_id, limit=limit, offset=offset)
        logger.debug(f"Fetched {len(checks)} user checks for user_id={user_id}")
        return {"success": True, "checks": checks, "total": len(checks)}
    except Exception as e:
        logger.error(f"Error fetching user checks for user_id={user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch user checks: {str(e)}")

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
        
        prediction = analytics.generate_ml_prediction()
        if prediction:
            db.add_expected_combination(
                white_balls=prediction["white_balls"],
                powerball=prediction["powerball"],
                score=prediction["confidence"],
                method=prediction["method"],
                reason=prediction["rationale"]
            )
        
        freq_prediction = analytics.generate_pattern_prediction()
        if freq_prediction:
            db.add_expected_combination(
                white_balls=freq_prediction["white_balls"],
                powerball=freq_prediction["powerball"],
                score=freq_prediction["confidence"],
                method=freq_prediction["method"],
                reason=freq_prediction["rationale"]
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
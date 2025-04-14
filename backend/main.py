from fastapi import FastAPI, HTTPException, Depends, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, field_validator, Field  # Change from 'validator' to 'field_validator'
from typing import List, Optional, Dict, Any, Union
import os
import logging
import asyncio
from datetime import datetime, timedelta
from contextlib import asynccontextmanager

# Import our modules
from db import get_db
from scraper import PowerballScraper
from analytics import get_analytics
from auth import (
    Token, UserCreate, UserLogin, User, 
    create_user, authenticate_user, create_access_token,
    get_current_user, get_optional_user, init_auth_schema
)
from scheduler import PowerballScheduler

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("data/logs/api.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("powerball-api")

# Models
class Draw(BaseModel):
    draw_number: int
    draw_date: str
    white_balls: List[int]
    powerball: int
    jackpot_amount: Optional[float] = 0
    winners: Optional[int] = 0
    
    @field_validator('white_balls')  # Change from @validator to @field_validator
    @classmethod  # Add this decorator
    def validate_white_balls(cls, v):
        if len(v) != 5:
            raise ValueError('Must provide exactly 5 white balls')
        if not all(1 <= x <= 69 for x in v):
            raise ValueError('White balls must be between 1 and 69')
        return sorted(v)
    
    @field_validator('powerball')  # Change from @validator to @field_validator
    @classmethod  # Add this decorator
    def validate_powerball(cls, v):
        if not 1 <= v <= 26:
            raise ValueError('Powerball must be between 1 and 26')
        return v

class NumberCheck(BaseModel):
    user_id: Optional[int] = 1
    draw_number: int
    numbers: List[int]
    
    @field_validator('numbers')  # Change from @validator to @field_validator
    @classmethod  # Add this decorator
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

# Startup and shutdown events
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize components
    app.state.db = get_db()
    app.state.scraper = PowerballScraper()
    app.state.analytics = get_analytics()
    app.state.scheduler = PowerballScheduler()
    
    # Connect to database
    if not app.state.db.connect():
        logger.error("Failed to connect to database")
    else:
        # Initialize database schema
        app.state.db.init_schema()
        # Initialize auth schema
        init_auth_schema()
    
    # Start the scheduler
    if os.environ.get("ENABLE_SCHEDULER", "false").lower() == "true":
        logger.info("Starting scheduler...")
        asyncio.create_task(app.state.scheduler.start())
    
    yield
    
    # Cleanup
    logger.info("Shutting down...")
    
    # Stop the scheduler
    if hasattr(app.state, "scheduler"):
        app.state.scheduler.stop()
    
    # Close database connection
    if hasattr(app.state, "db"):
        app.state.db.close()

# Create FastAPI app
app = FastAPI(
    title="Powerball Analyzer API",
    description="API for analyzing and predicting Powerball lottery results",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/token", auto_error=False)

# Routes
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

# Authentication routes
@app.post("/api/auth/register", response_model=User)
async def register_user(user_data: UserCreate):
    user = create_user(user_data)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists"
        )
    
    return user

@app.post("/api/auth/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    user = authenticate_user(form_data.username, form_data.password)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create access token
    access_token_expires = timedelta(minutes=60 * 24)  # 1 day
    access_token = create_access_token(
        data={"sub": user["username"], "user_id": user["id"]},
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": user["id"],
        "username": user["username"]
    }

@app.get("/api/auth/me", response_model=User)
async def read_users_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    return current_user

# Draws endpoints
@app.get("/api/draws")
async def get_draws(limit: int = 20, offset: int = 0):
    db = get_db()
    draws = db.get_draws(limit=limit, offset=offset)
    
    return {"success": True, "draws": draws, "count": len(draws)}

@app.get("/api/draws/latest")
async def get_latest_draw():
    db = get_db()
    draw = db.get_latest_draw()
    
    if not draw:
        raise HTTPException(status_code=404, detail="No draws available")
    
    return {"success": True, "draw": draw}

@app.get("/api/draws/{draw_number}")
async def get_draw_by_number(draw_number: int):
    db = get_db()
    draw = db.get_draw_by_number(draw_number)
    
    if not draw:
        raise HTTPException(status_code=404, detail=f"Draw {draw_number} not found")
    
    return {"success": True, "draw": draw}

@app.post("/api/draws/add")
async def add_draw(
    draw: Draw, 
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    db = get_db()
    result = db.add_draw(
        draw_number=draw.draw_number,
        draw_date=draw.draw_date,
        white_balls=draw.white_balls,
        powerball=draw.powerball,
        jackpot_amount=draw.jackpot_amount,
        winners=draw.winners,
        source='user'
    )
    
    if not result:
        raise HTTPException(status_code=400, detail="Failed to add draw")
    
    return {"success": True, "draw": result}

# Check numbers endpoint
@app.post("/api/check_numbers")
async def check_numbers(
    check: NumberCheck,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)
):
    db = get_db()
    
    # Get user ID (use anonymous if not authenticated)
    user_id = current_user["id"] if current_user else 1
    
    # Find the draw
    draw = db.get_draw_by_number(check.draw_number)
    
    if not draw:
        raise HTTPException(status_code=404, detail="Draw not found")
    
    # Check matches
    white_balls_to_check = check.numbers[:5]
    powerball_to_check = check.numbers[5]
    
    white_matches = [n for n in white_balls_to_check if n in draw["white_balls"]]
    powerball_match = powerball_to_check == draw["powerball"]
    
    # Determine prize
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
    
    # Record the check in the database
    check_result = db.add_user_check(
        user_id=user_id,
        draw_id=draw["id"],
        numbers=check.numbers,
        white_matches=white_matches,
        powerball_match=powerball_match,
        is_winner=is_winner,
        prize=prize
    )
    
    # Create the response
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
    
    return {"success": True, "result": result}

# Scraping endpoints
@app.post("/api/scrape/latest")
async def scrape_latest(
    background_tasks: BackgroundTasks,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)  # Changed from get_current_user
):
    scraper = PowerballScraper()
    db = get_db()
    
    try:
        # Scrape the latest draw
        draw_data = await scraper.fetch_latest_draw()
        
        if not draw_data:
            raise HTTPException(status_code=404, detail="No data found")
        
        # Check if draw already exists
        existing_draw = db.get_draw_by_number(draw_data['draw_number'])
        
        if existing_draw:
            return {"success": True, "message": "Draw already exists", "draw": existing_draw}
        
        # Add to database
        new_draw = db.add_draw(
            draw_number=draw_data['draw_number'],
            draw_date=draw_data['draw_date'],
            white_balls=draw_data['white_balls'],
            powerball=draw_data['powerball'],
            jackpot_amount=draw_data['jackpot_amount'],
            winners=draw_data['winners'],
            source=draw_data.get('source', 'api')
        )
        
        if not new_draw:
            raise HTTPException(status_code=500, detail="Failed to add draw to database")
        
        # Schedule analytics updates
        background_tasks.add_task(run_analytics_tasks)
        
        return {"success": True, "draw": new_draw}
            
    except Exception as e:
        logger.error(f"Error scraping latest draw: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/scrape/historical")
async def scrape_historical(
    background_tasks: BackgroundTasks,
    count: int = 20,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    scraper = PowerballScraper()
    db = get_db()
    
    try:
        # Scrape historical draws
        draws = await scraper.fetch_historical_draws(count=count)
        
        if not draws:
            raise HTTPException(status_code=404, detail="No historical draws found")
        
        # Add draws to database
        new_draws = []
        for draw_data in draws:
            # Check if draw already exists
            existing = db.get_draw_by_number(draw_data['draw_number'])
            if existing:
                continue
                
            # Add to database
            new_draw = db.add_draw(
                draw_number=draw_data['draw_number'],
                draw_date=draw_data['draw_date'],
                white_balls=draw_data['white_balls'],
                powerball=draw_data['powerball'],
                jackpot_amount=draw_data['jackpot_amount'],
                winners=draw_data['winners'],
                source=draw_data.get('source', 'api')
            )
            
            if new_draw:
                new_draws.append(new_draw)
        
        # Schedule analytics updates if new draws were added
        if new_draws:
            background_tasks.add_task(run_analytics_tasks)
        
        return {"success": True, "draws": new_draws, "count": len(new_draws)}
        
    except Exception as e:
        logger.error(f"Error scraping historical draws: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Predictions endpoints
@app.post("/api/predictions")
async def generate_prediction(
    request: PredictionRequest,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)
):
    db = get_db()
    analytics = get_analytics()
    
    # Get user ID (use anonymous if not authenticated)
    user_id = current_user["id"] if current_user else 1
    
    # Different prediction methods
    prediction = None
    
    if request.method.lower() == 'machine-learning':
        # Use ML prediction
        prediction = analytics.generate_ml_prediction()
    else:
        # Use pattern-based prediction
        prediction = analytics.generate_pattern_prediction()
    
    # Add user_id
    prediction["user_id"] = user_id
    
    # Save the prediction to database
    db_prediction = db.add_prediction(
        white_balls=prediction["white_balls"],
        powerball=prediction["powerball"],
        method=prediction["method"],
        confidence=prediction["confidence"],
        rationale=prediction["rationale"],
        user_id=user_id
    )
    
    # Store in analytics results
    db.save_analysis_result('prediction', prediction)
    
    return {"success": True, "prediction": prediction}

@app.get("/api/predictions")
async def get_predictions(
    method: Optional[str] = None,
    limit: int = 10, 
    offset: int = 0,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)  # Changed from get_current_user
):
    db = get_db()
    
    # Get user ID (use anonymous if not authenticated)
    user_id = current_user["id"] if current_user else None
    
    # Get predictions
    predictions = db.get_predictions(
        method=method,
        user_id=user_id,
        limit=limit,
        offset=offset
    )
    
    return predictions

# Analysis and insights endpoints
@app.get("/api/insights/frequency")
async def get_frequency_analysis():
    db = get_db()
    frequency = db.get_frequency_analysis()
    
    return frequency

@app.get("/api/insights/due")
async def get_due_numbers():
    analytics = get_analytics()
    db = get_db()
    
    try:
        # Check for saved analysis
        results = db.get_analysis_results('due_numbers', limit=1)
        
        if results:
            # Return saved analysis
            return results[0]['result_data']
        
        # Get frequency analysis
        freq = db.get_frequency_analysis()
        
        # Convert to sorted lists of (number, frequency) tuples
        white_freq = [(int(num), freq) for num, freq in freq['white_balls'].items()]
        pb_freq = [(int(num), freq) for num, freq in freq['powerballs'].items()]
        
        # Sort by frequency (lowest first)
        white_freq.sort(key=lambda x: x[1])
        pb_freq.sort(key=lambda x: x[1])
        
        # Get top 10 due white balls and top 5 due powerballs
        due_white = white_freq[:10]
        due_pb = pb_freq[:5]
        
        result = {
            "white_balls": {str(num): freq for num, freq in due_white},
            "powerballs": {str(num): freq for num, freq in due_pb}
        }
        
        # Save analysis
        db.save_analysis_result('due_numbers', result)
        
        return result
    
    except Exception as e:
        logger.error(f"Error getting due numbers: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/insights/hot")
async def get_hot_numbers():
    analytics = get_analytics()
    db = get_db()
    
    try:
        # Check for saved analysis
        results = db.get_analysis_results('hot_numbers', limit=1)
        
        if results:
            # Return saved analysis
            return results[0]['result_data']
        
        # Get frequency analysis
        freq = db.get_frequency_analysis()
        
        # Convert to sorted lists of (number, frequency) tuples
        white_freq = [(int(num), freq) for num, freq in freq['white_balls'].items()]
        pb_freq = [(int(num), freq) for num, freq in freq['powerballs'].items()]
        
        # Sort by frequency (highest first)
        white_freq.sort(key=lambda x: x[1], reverse=True)
        pb_freq.sort(key=lambda x: x[1], reverse=True)
        
        # Get top 10 hot white balls and top 5 hot powerballs
        hot_white = white_freq[:10]
        hot_pb = pb_freq[:5]
        
        result = {
            "white_balls": {str(num): freq for num, freq in hot_white},
            "powerballs": {str(num): freq for num, freq in hot_pb}
        }
        
        # Save analysis
        db.save_analysis_result('hot_numbers', result)
        
        return result
    
    except Exception as e:
        logger.error(f"Error getting hot numbers: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/insights/pairs")
async def get_pair_analysis():
    db = get_db()
    
    try:
        # Check for saved analysis
        results = db.get_analysis_results('pair_analysis', limit=1)
        
        if results:
            # Return saved analysis
            return results[0]['result_data']
        
        # Get all draws
        draws = db.get_draws(limit=1000)
        
        if not draws:
            return {"common_pairs": []}
        
        # Create a counter for pairs of white balls
        from collections import Counter
        pairs_counter = Counter()
        
        for draw in draws:
            white_balls = draw["white_balls"]
            # Generate all possible pairs
            for i in range(len(white_balls)):
                for j in range(i + 1, len(white_balls)):
                    # Sort the pair so (1,2) and (2,1) are counted as the same
                    pair = tuple(sorted([white_balls[i], white_balls[j]]))
                    pairs_counter[pair] += 1
        
        # Get the most common pairs
        common_pairs = pairs_counter.most_common(15)
        
        result = {
            "common_pairs": [{"pair": list(pair), "count": count} for pair, count in common_pairs]
        }
        
        # Save analysis
        db.save_analysis_result('pair_analysis', result)
        
        return result
    
    except Exception as e:
        logger.error(f"Error in pair analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/insights/positions")
async def get_position_analysis():
    db = get_db()
    
    try:
        # Check for saved analysis
        results = db.get_analysis_results('position_analysis', limit=1)
        
        if results:
            # Return saved analysis
            return results[0]['result_data']
        
        # Get all draws
        draws = db.get_draws(limit=1000)
        
        if not draws:
            return {"positions": []}
        
        # Initialize counters for each position
        from collections import Counter
        position_counters = [Counter() for _ in range(5)]
        
        for draw in draws:
            white_balls = draw["white_balls"]
            # Count numbers in each position
            for i in range(5):
                position_counters[i][white_balls[i]] += 1
        
        # Get top 5 numbers for each position
        position_analysis = []
        
        for i, counter in enumerate(position_counters):
            top_numbers = counter.most_common(5)
            position_analysis.append({
                "position": i + 1,
                "top_numbers": [{"number": num, "count": count} for num, count in top_numbers]
            })
        
        result = {"positions": position_analysis}
        
        # Save analysis
        db.save_analysis_result('position_analysis', result)
        
        return result
    
    except Exception as e:
        logger.error(f"Error in position analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/insights/cluster")
async def get_cluster_analysis(
    force_refresh: bool = False,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    analytics = get_analytics()
    db = get_db()
    
    try:
        # Check for saved analysis unless refresh is forced
        if not force_refresh:
            results = db.get_analysis_results('cluster_analysis', limit=1)
            
            if results:
                # Return saved analysis
                return results[0]['result_data']
        
        # Run cluster analysis
        result = analytics.cluster_analysis()
        
        return result
    
    except Exception as e:
        logger.error(f"Error in cluster analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/insights/all")
async def get_all_insights():
    db = get_db()
    analytics = get_analytics()
    
    try:
        # Get analysis summary
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
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    # Run analytics tasks in the background
    background_tasks.add_task(run_analytics_tasks)
    
    return {
        "success": True, 
        "message": "Analytics tasks scheduled"
    }

@app.get("/api/combinations")
async def get_top_combinations(limit: int = 10):
    db = get_db()
    combinations = db.get_expected_combinations(limit=limit)
    
    return combinations

@app.post("/api/combinations/update")
async def update_combinations(
    background_tasks: BackgroundTasks,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    # Run combination update in the background
    background_tasks.add_task(update_combinations_task)
    
    return {
        "success": True, 
        "message": "Combinations update scheduled"
    }

@app.get("/api/user_stats")
async def get_user_statistics(
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)
):
    db = get_db()
    
    # Get user ID (use anonymous if not authenticated)
    user_id = current_user["id"] if current_user else 1
    
    # Get user stats
    stats = db.get_user_stats(user_id)
    
    return stats

@app.get("/api/user_checks")
async def get_user_checks(
    limit: int = 10,
    offset: int = 0,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)
):
    db = get_db()
    
    # Get user ID (use anonymous if not authenticated)
    user_id = current_user["id"] if current_user else 1
    
    # Get user checks
    checks = db.get_user_checks(user_id, limit=limit, offset=offset)
    
    return {"success": True, "checks": checks, "total": len(checks)}

# Background tasks
async def run_analytics_tasks():
    """Run all analytics tasks"""
    try:
        analytics = get_analytics()
        logger.info("Running analytics tasks...")
        
        # Run analyses
        result = analytics.run_all_analyses()
        
        if result.get('success', False):
            logger.info("Analytics tasks completed successfully")
        else:
            logger.error(f"Analytics tasks failed: {result.get('message', 'Unknown error')}")
    
    except Exception as e:
        logger.error(f"Error in analytics tasks: {str(e)}")

async def update_combinations_task():
    """Update expected combinations"""
    try:
        analytics = get_analytics()
        db = get_db()
        
        logger.info("Updating expected combinations...")
        
        # Clear existing combinations
        db.clear_expected_combinations()
        
        # Generate new combinations
        # Get latest prediction
        prediction = analytics.generate_ml_prediction()
        
        if prediction:
            # Add as a combination
            db.add_expected_combination(
                white_balls=prediction["white_balls"],
                powerball=prediction["powerball"],
                score=prediction["confidence"],
                method=prediction["method"],
                reason=prediction["rationale"]
            )
        
        # Get frequency-based prediction
        freq_prediction = analytics.generate_pattern_prediction()
        
        if freq_prediction:
            # Add as a combination
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

@app.post("/api/auth/register", response_model=User)
async def register_user(user_data: UserCreate):
    user = create_user(user_data)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists"
        )
    
    return user

# Run the application
if __name__ == "__main__":
    import uvicorn
    
    # Create data directory if it doesn't exist
    os.makedirs("data/logs", exist_ok=True)
    
    # Run the server
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=int(os.environ.get("PORT", 5001)),
        log_level=os.environ.get("LOG_LEVEL", "info").lower()
    )
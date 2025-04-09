from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import numpy as np
from datetime import datetime
import json
import httpx
from bs4 import BeautifulSoup

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data Models
class Draw(BaseModel):
    draw_number: int
    draw_date: str
    white_balls: List[int]
    powerball: int
    jackpot_amount: Optional[float] = 0
    winners: Optional[int] = 0

class NumberCheck(BaseModel):
    user_id: str
    draw_id: str
    numbers: List[int]

class Prediction(BaseModel):
    white_balls: List[int]
    powerball: int
    confidence: float
    method: str
    user_id: str

# In-memory storage (replace with database in production)
draws = []
user_checks = []
predictions = []

@app.get("/")
async def read_root():
    return {"status": "ok", "message": "Powerball Analysis API"}

@app.get("/api/draws")
async def get_draws():
    return draws

@app.post("/api/draws/add")
async def add_draw(draw: Draw):
    # Validate numbers
    if len(draw.white_balls) != 5:
        raise HTTPException(status_code=400, detail="Must provide exactly 5 white balls")
    if not all(1 <= x <= 69 for x in draw.white_balls):
        raise HTTPException(status_code=400, detail="White balls must be between 1 and 69")
    if not 1 <= draw.powerball <= 26:
        raise HTTPException(status_code=400, detail="Powerball must be between 1 and 26")
    
    draws.append(draw.dict())
    return {"success": True, "draw": draw}

@app.post("/api/check_numbers")
async def check_numbers(check: NumberCheck):
    # Find the draw
    draw = next((d for d in draws if d["draw_id"] == check.draw_id), None)
    if not draw:
        raise HTTPException(status_code=404, detail="Draw not found")
    
    # Check matches
    white_matches = [n for n in check.numbers[:5] if n in draw["white_balls"]]
    powerball_match = check.numbers[5] == draw["powerball"]
    
    result = {
        "user_id": check.user_id,
        "draw_id": check.draw_id,
        "white_matches": white_matches,
        "powerball_match": powerball_match,
        "timestamp": datetime.now().isoformat()
    }
    user_checks.append(result)
    
    return result

@app.post("/api/scrape/latest")
async def scrape_latest():
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get("https://www.powerball.com/api/v1/numbers/recent")
            data = response.json()
            
            if not data:
                raise HTTPException(status_code=404, detail="No data found")
            
            latest = data[0]
            draw = Draw(
                draw_number=latest["drawNumber"],
                draw_date=latest["drawDate"],
                white_balls=[int(n) for n in latest["numbers"][:5]],
                powerball=int(latest["numbers"][5]),
                jackpot_amount=float(latest["jackpot"].replace("$", "").replace(",", "")),
                winners=latest.get("winners", 0)
            )
            
            # Add to storage if not exists
            if not any(d["draw_number"] == draw.draw_number for d in draws):
                draws.append(draw.dict())
                return {"success": True, "draw": draw}
            return {"success": False, "message": "Draw already exists"}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/predictions")
async def generate_prediction(request: Prediction):
    # Simple random prediction for demonstration
    # Replace with actual prediction logic
    white_balls = sorted(np.random.choice(range(1, 70), 5, replace=False))
    powerball = np.random.randint(1, 27)
    confidence = np.random.uniform(0.5, 0.9)
    
    prediction = {
        "white_balls": white_balls.tolist(),
        "powerball": int(powerball),
        "confidence": float(confidence),
        "method": request.method,
        "user_id": request.user_id,
        "timestamp": datetime.now().isoformat()
    }
    predictions.append(prediction)
    
    return prediction

@app.get("/api/insights/frequency")
async def get_frequency_analysis():
    if not draws:
        return {"white_balls": {}, "powerballs": {}}
    
    white_balls = np.concatenate([d["white_balls"] for d in draws])
    powerballs = [d["powerball"] for d in draws]
    
    white_freq = {str(i): int(np.sum(white_balls == i)) for i in range(1, 70)}
    pb_freq = {str(i): int(np.sum(np.array(powerballs) == i)) for i in range(1, 27)}
    
    return {
        "white_balls": white_freq,
        "powerballs": pb_freq
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5001)
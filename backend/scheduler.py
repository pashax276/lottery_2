import asyncio
import logging
import time
import os
import signal
import sys
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

# Import our scraper and database
from scraper import PowerballScraper
from db import get_db

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("data/logs/scheduler.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("powerball-scheduler")

class PowerballScheduler:
    """
    Scheduler for periodically scraping Powerball results and other tasks
    """
    
    def __init__(self):
        """Initialize the scheduler"""
        self.scraper = PowerballScraper()
        self.db = get_db()
        self.running = False
        self.tasks = {}
        
        # Register signal handlers
        signal.signal(signal.SIGINT, self.handle_shutdown)
        signal.signal(signal.SIGTERM, self.handle_shutdown)
        
        logger.info("Powerball scheduler initialized")
    
    def handle_shutdown(self, signum, frame):
        """Handle shutdown signals"""
        logger.info(f"Received signal {signum}, shutting down...")
        self.stop()
        sys.exit(0)
    
    async def start(self):
        """Start the scheduler"""
        if self.running:
            logger.warning("Scheduler is already running")
            return
        
        self.running = True
        logger.info("Starting scheduler...")
        
        # Connect to the database
        if not self.db.connect():
            logger.error("Failed to connect to the database, scheduler cannot start")
            self.running = False
            return
        
        # Initialize schema if needed
        self.db.init_schema()
        
        # Start tasks
        self.tasks = {
            "scrape_latest": asyncio.create_task(self.schedule_scrape_latest()),
            "update_combinations": asyncio.create_task(self.schedule_update_combinations()),
            "cleanup": asyncio.create_task(self.schedule_cleanup())
        }
        
        # Wait for all tasks
        await asyncio.gather(*self.tasks.values(), return_exceptions=True)
    
    def stop(self):
        """Stop the scheduler"""
        if not self.running:
            return
        
        logger.info("Stopping scheduler...")
        self.running = False
        
        # Cancel all tasks
        for name, task in self.tasks.items():
            if not task.done():
                logger.info(f"Cancelling task {name}...")
                task.cancel()
        
        self.tasks = {}
        
        # Close database connection
        self.db.close()
        
        logger.info("Scheduler stopped")
    
    async def schedule_scrape_latest(self):
        """Schedule regular scraping of the latest draw"""
        logger.info("Starting scheduled scraping of latest draw")
        
        # Check for appropriate schedule times
        # Powerball drawings are on Monday, Wednesday, and Saturday at 10:59 PM ET
        POWERBALL_DAYS = [0, 2, 5]  # Monday, Wednesday, Saturday (as per datetime.weekday())
        SCRAPE_HOUR = 23  # 11 PM
        SCRAPE_MINUTE = 15  # 15 minutes after the draw
        
        while self.running:
            try:
                now = datetime.now()
                
                # Check if it's a draw day
                if now.weekday() in POWERBALL_DAYS:
                    # Check if it's after the draw time
                    if now.hour >= SCRAPE_HOUR and now.minute >= SCRAPE_MINUTE:
                        # Scrape the latest draw
                        logger.info("Scraping latest draw...")
                        draw = await self.scrape_latest()
                        
                        if draw:
                            logger.info(f"Successfully scraped draw #{draw['draw_number']} from {draw['draw_date']}")
                        else:
                            logger.warning("Failed to scrape latest draw")
                
                # Sleep until the next minute
                await asyncio.sleep(60)
                
            except asyncio.CancelledError:
                logger.info("Scrape latest task cancelled")
                break
            except Exception as e:
                logger.error(f"Error in scrape latest task: {str(e)}")
                await asyncio.sleep(60)
    
    async def schedule_update_combinations(self):
        """Schedule regular updating of expected combinations"""
        logger.info("Starting scheduled updating of expected combinations")
        
        # Update combinations once per day
        UPDATE_HOUR = 12  # Noon
        
        while self.running:
            try:
                now = datetime.now()
                
                # Check if it's update time
                if now.hour == UPDATE_HOUR and now.minute == 0:
                    # Update combinations
                    logger.info("Updating expected combinations...")
                    success = await self.update_combinations()
                    
                    if success:
                        logger.info("Successfully updated expected combinations")
                    else:
                        logger.warning("Failed to update expected combinations")
                
                # Sleep until the next minute
                await asyncio.sleep(60)
                
            except asyncio.CancelledError:
                logger.info("Update combinations task cancelled")
                break
            except Exception as e:
                logger.error(f"Error in update combinations task: {str(e)}")
                await asyncio.sleep(60)
    
    async def schedule_cleanup(self):
        """Schedule regular cleanup tasks"""
        logger.info("Starting scheduled cleanup tasks")
        
        # Run cleanup once per week
        CLEANUP_DAY = 6  # Sunday (as per datetime.weekday())
        CLEANUP_HOUR = 3  # 3 AM
        
        while self.running:
            try:
                now = datetime.now()
                
                # Check if it's cleanup time
                if now.weekday() == CLEANUP_DAY and now.hour == CLEANUP_HOUR and now.minute == 0:
                    # Run cleanup tasks
                    logger.info("Running cleanup tasks...")
                    await self.run_cleanup()
                    logger.info("Cleanup tasks completed")
                
                # Sleep until the next minute
                await asyncio.sleep(60)
                
            except asyncio.CancelledError:
                logger.info("Cleanup task cancelled")
                break
            except Exception as e:
                logger.error(f"Error in cleanup task: {str(e)}")
                await asyncio.sleep(60)
    
    async def scrape_latest(self) -> Optional[Dict[str, Any]]:
        """Scrape the latest Powerball draw"""
        try:
            # Fetch the latest draw
            draw_data = await self.scraper.fetch_latest_draw()
            
            if not draw_data:
                logger.warning("No draw data returned from scraper")
                return None
            
            # Add to database
            draw = self.db.add_draw(
                draw_number=draw_data['draw_number'],
                draw_date=draw_data['draw_date'],
                white_balls=draw_data['white_balls'],
                powerball=draw_data['powerball'],
                jackpot_amount=draw_data['jackpot_amount'],
                winners=draw_data['winners'],
                source=draw_data.get('source', 'api')
            )
            
            return draw
            
        except Exception as e:
            logger.error(f"Error scraping latest draw: {str(e)}")
            return None
    
    async def update_combinations(self) -> bool:
        """Update expected combinations based on analysis"""
        try:
            # Clear existing combinations
            self.db.clear_expected_combinations()
            
            # Generate new combinations
            # This is a simplified example; a real implementation would use
            # more sophisticated algorithms
            
            # Get frequency analysis
            freq_analysis = self.db.get_frequency_analysis()
            
            # Convert to sorted lists of (number, frequency) tuples
            white_freq = [(int(num), freq) for num, freq in freq_analysis['white_balls'].items()]
            pb_freq = [(int(num), freq) for num, freq in freq_analysis['powerballs'].items()]
            
            # Sort by frequency (highest first)
            white_freq.sort(key=lambda x: x[1], reverse=True)
            pb_freq.sort(key=lambda x: x[1], reverse=True)
            
            # Generate combinations
            combinations = []
            
            # Top frequency combination
            top_white = [num for num, _ in white_freq[:5]]
            top_white.sort()
            top_pb = pb_freq[0][0]
            
            combinations.append({
                'white_balls': top_white,
                'powerball': top_pb,
                'score': 0.95,
                'method': 'frequency',
                'reason': 'Based on highest frequency numbers'
            })
            
            # Mid-frequency combination
            mid_white = [num for num, _ in white_freq[5:10]]
            mid_white.sort()
            mid_pb = pb_freq[1][0]
            
            combinations.append({
                'white_balls': mid_white,
                'powerball': mid_pb,
                'score': 0.85,
                'method': 'frequency',
                'reason': 'Based on moderately frequent numbers'
            })
            
            # Add combinations to database
            for combo in combinations:
                self.db.add_expected_combination(
                    white_balls=combo['white_balls'],
                    powerball=combo['powerball'],
                    score=combo['score'],
                    method=combo['method'],
                    reason=combo['reason']
                )
            
            return True
            
        except Exception as e:
            logger.error(f"Error updating combinations: {str(e)}")
            return False
    
    async def run_cleanup(self) -> None:
        """Run cleanup tasks"""
        try:
            # Clean up old analysis results
            # Keep only the 10 most recent of each type
            
            # Example cleanup task
            logger.info("Cleanup tasks would run here")
            
        except Exception as e:
            logger.error(f"Error in cleanup: {str(e)}")


# Standalone execution
if __name__ == "__main__":
    # Create log directory
    os.makedirs("data/logs", exist_ok=True)
    
    # Initialize scheduler
    scheduler = PowerballScheduler()
    
    try:
        # Run the scheduler
        asyncio.run(scheduler.start())
    except KeyboardInterrupt:
        # Handle keyboard interrupt
        print("Keyboard interrupt received, shutting down...")
    finally:
        # Ensure scheduler is stopped
        scheduler.stop()
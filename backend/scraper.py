import httpx
import logging
import random
import time
import os
import json
import re
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
import asyncio
from bs4 import BeautifulSoup
from fake_useragent import UserAgent
from tenacity import retry, stop_after_attempt, wait_fixed, retry_if_exception_type

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("powerball-scraper")

class PowerballScraper:
    """
    Scraper for Powerball results from the California Lottery website
    """
    
    def __init__(self):
        """Initialize the Powerball scraper"""
        self.user_agent = UserAgent()
        # California Lottery API for Powerball (game ID 9)
        self.ca_api_url = "https://www.calottery.com/api/DrawGameApi/DrawGamePastDrawResults/9"
        # Backup URL for web scraping
        self.web_url = "https://www.calottery.com/draw-games/powerball"
        logger.info(f"Powerball scraper initialized")
    
    async def fetch_latest_draw(self) -> Dict[str, Any]:
        """
        Fetch the latest Powerball draw
        
        Returns:
            dict: The latest draw data
        """
        logger.info("Fetching latest Powerball draw...")
        
        # Try the API first
        try:
            draw = await self._fetch_from_ca_api()
            if draw:
                return draw
        except Exception as e:
            logger.error(f"Error fetching from CA API: {str(e)}")
        
        # Fall back to web scraping
        try:
            draw = await self._fetch_from_web()
            if draw:
                return draw
        except Exception as e:
            logger.error(f"Error fetching from web: {str(e)}")
        
        # Fall back to mock data as a last resort
        logger.warning("All fetch methods failed, generating mock data")
        return self._generate_mock_draw()
    
    async def fetch_historical_draws(self, count: int = 20) -> List[Dict[str, Any]]:
        """
        Fetch historical Powerball draws
        
        Args:
            count: Number of historical draws to fetch
        
        Returns:
            list: The historical draw data
        """
        logger.info(f"Fetching {count} historical Powerball draws...")
        
        try:
            draws = await self._fetch_historical_from_ca_api(count)
            if draws:
                return draws
        except Exception as e:
            logger.error(f"Error fetching historical draws from CA API: {str(e)}")
        
        # Fall back to web scraping
        try:
            draws = await self._fetch_historical_from_web(count)
            if draws:
                return draws
        except Exception as e:
            logger.error(f"Error fetching historical draws from web: {str(e)}")
        
        # Fall back to mock data
        logger.warning("All historical fetch methods failed, generating mock data")
        return self._generate_mock_historical_draws(count)
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_fixed(2),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException))
    )
    async def _fetch_from_ca_api(self) -> Optional[Dict[str, Any]]:
        """Fetch the latest draw from the California Lottery API"""
        headers = {
            'User-Agent': self.user_agent.random,
            'Accept': 'application/json',
            'Referer': 'https://www.calottery.com/draw-games/powerball'
        }
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(self.ca_api_url, headers=headers)
            response.raise_for_status()
            data = response.json()
            
            if not data or 'results' not in data or not data['results']:
                logger.warning("No results found in CA API response")
                return None
            
            # Parse the first result (latest draw)
            latest = data['results'][0]
            return self._parse_ca_api_draw(latest)
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_fixed(2),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException))
    )
    async def _fetch_historical_from_ca_api(self, count: int) -> List[Dict[str, Any]]:
        """Fetch historical draws from the California Lottery API"""
        headers = {
            'User-Agent': self.user_agent.random,
            'Accept': 'application/json',
            'Referer': 'https://www.calottery.com/draw-games/powerball'
        }
        
        # Calculate number of pages needed (20 results per page)
        pages = (count + 19) // 20
        all_draws = []
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            for page in range(1, pages + 1):
                url = f"{self.ca_api_url}?page={page}&pageSize=20"
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                data = response.json()
                
                if not data or 'results' not in data or not data['results']:
                    break
                
                draws = [self._parse_ca_api_draw(draw) for draw in data['results']]
                all_draws.extend(draws)
                
                # Add delay between requests
                await asyncio.sleep(random.uniform(1.0, 2.0))
                
                if len(all_draws) >= count:
                    break
        
        return all_draws[:count]
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_fixed(2),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException))
    )
    async def _fetch_from_web(self) -> Optional[Dict[str, Any]]:
        """Fetch the latest draw by scraping the website"""
        headers = {
            'User-Agent': self.user_agent.random,
            'Accept': 'text/html,application/xhtml+xml,application/xml',
            'Accept-Language': 'en-US,en;q=0.9'
        }
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(self.web_url, headers=headers)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Find the latest draw section
            draw_section = soup.select_one('.draw-cards .draw-card')
            if not draw_section:
                logger.warning("Could not find draw section in web page")
                return None
            
            # Extract draw date
            date_element = draw_section.select_one('.draw-card--header time')
            draw_date = date_element.text.strip() if date_element else "Unknown Date"
            
            # Format date if needed (e.g., "Saturday, April 6, 2025" -> "2025-04-06")
            try:
                date_obj = datetime.strptime(draw_date, "%A, %B %d, %Y")
                draw_date = date_obj.strftime("%Y-%m-%d")
            except ValueError:
                # Keep original format if parsing fails
                pass
            
            # Extract draw number
            draw_number_element = draw_section.select_one('.draw-card--header .draw-card--draw-number')
            draw_number_text = draw_number_element.text.strip() if draw_number_element else ""
            draw_number = 0
            
            # Extract draw number using regex or string manipulation
            match = re.search(r'(\d+)', draw_number_text)
            if match:
                draw_number = int(match.group(1))
            
            # Extract winning numbers
            number_elements = draw_section.select('.winning-number')
            white_balls = []
            powerball = 0
            
            if number_elements:
                # Last number is usually the Powerball
                for i, elem in enumerate(number_elements):
                    num = int(elem.text.strip())
                    if i < len(number_elements) - 1:
                        white_balls.append(num)
                    else:
                        powerball = num
            
            # Extract jackpot amount
            jackpot_element = draw_section.select_one('.draw-card--prize-amount')
            jackpot_text = jackpot_element.text.strip() if jackpot_element else "$0"
            
            # Parse jackpot amount
            jackpot_amount = 0
            try:
                # Remove $ and commas
                jackpot_text = jackpot_text.replace('$', '').replace(',', '')
                
                # Handle "Million" and "Billion"
                if 'Million' in jackpot_text:
                    jackpot_text = jackpot_text.replace('Million', '').strip()
                    jackpot_amount = float(jackpot_text) * 1_000_000
                elif 'Billion' in jackpot_text:
                    jackpot_text = jackpot_text.replace('Billion', '').strip()
                    jackpot_amount = float(jackpot_text) * 1_000_000_000
                else:
                    jackpot_amount = float(jackpot_text)
            except (ValueError, TypeError):
                jackpot_amount = 0
            
            # Construct result
            if white_balls and powerball:
                return {
                    'draw_number': draw_number,
                    'draw_date': draw_date,
                    'white_balls': white_balls,
                    'powerball': powerball,
                    'jackpot_amount': jackpot_amount,
                    'winners': 0,  # Web scraping might not get winner information
                    'source': 'web_scraping'
                }
            
            return None
    
    async def _fetch_historical_from_web(self, count: int) -> List[Dict[str, Any]]:
        """Fetch historical draws by scraping the website"""
        headers = {
            'User-Agent': self.user_agent.random,
            'Accept': 'text/html,application/xhtml+xml,application/xml',
            'Accept-Language': 'en-US,en;q=0.9'
        }
        
        all_draws = []
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Start with the main page for the first few draws
            response = await client.get(self.web_url, headers=headers)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            draw_sections = soup.select('.draw-cards .draw-card')
            
            for section in draw_sections:
                draw = self._parse_web_draw_section(section)
                if draw:
                    all_draws.append(draw)
            
            # If we need more, we might need to navigate to a past draws page
            if len(all_draws) < count:
                # Look for a "Past Draws" or similar link
                past_draws_link = soup.select_one('a[href*="past-draws"]')
                if past_draws_link and past_draws_link.get('href'):
                    past_url = past_draws_link['href']
                    if not past_url.startswith('http'):
                        past_url = f"https://www.calottery.com{past_url}"
                    
                    # Fetch past draws page
                    response = await client.get(past_url, headers=headers)
                    response.raise_for_status()
                    
                    soup = BeautifulSoup(response.text, 'html.parser')
                    more_draw_sections = soup.select('.draw-cards .draw-card, .past-draws-table tr')
                    
                    for section in more_draw_sections:
                        draw = self._parse_web_draw_section(section)
                        if draw:
                            all_draws.append(draw)
                            if len(all_draws) >= count:
                                break
        
        return all_draws[:count]
    
    def _parse_web_draw_section(self, section) -> Optional[Dict[str, Any]]:
        """Parse a draw section from the web page"""
        try:
            # Different parsing based on element type (card or table row)
            if section.name == 'tr':
                # Table row format
                cells = section.select('td')
                if len(cells) < 4:
                    return None
                
                # Date is usually in first cell
                date_text = cells[0].text.strip()
                try:
                    date_obj = datetime.strptime(date_text, "%m/%d/%Y")
                    draw_date = date_obj.strftime("%Y-%m-%d")
                except ValueError:
                    draw_date = date_text
                
                # Draw number might be in a cell or not present
                draw_number = 0
                for cell in cells:
                    if 'draw' in cell.text.lower() and '#' in cell.text:
                        num_text = cell.text.split('#')[1].strip()
                        try:
                            draw_number = int(num_text)
                            break
                        except ValueError:
                            pass
                
                # Numbers are usually in a cell with balls or spans
                white_balls = []
                powerball = 0
                
                # Look for elements with numbers
                number_elements = section.select('.lottery-ball, .winning-number, .number')
                if number_elements:
                    for i, elem in enumerate(number_elements):
                        try:
                            num = int(elem.text.strip())
                            if i < len(number_elements) - 1:
                                white_balls.append(num)
                            else:
                                powerball = num
                        except ValueError:
                            pass
                else:
                    # Try to parse from text if no elements found
                    for cell in cells:
                        if '-' in cell.text or ',' in cell.text:
                            # Numbers might be separated by commas or hyphens
                            separators = [',', '-']
                            for sep in separators:
                                if sep in cell.text:
                                    parts = cell.text.split(sep)
                                    if len(parts) >= 6:  # 5 white balls + powerball
                                        try:
                                            white_balls = [int(p.strip()) for p in parts[:5]]
                                            powerball = int(parts[5].strip())
                                            break
                                        except ValueError:
                                            pass
                
            else:
                # Card format
                # Extract draw date
                date_element = section.select_one('.draw-card--header time')
                draw_date = date_element.text.strip() if date_element else "Unknown Date"
                
                # Format date if needed
                try:
                    date_obj = datetime.strptime(draw_date, "%A, %B %d, %Y")
                    draw_date = date_obj.strftime("%Y-%m-%d")
                except ValueError:
                    # Keep original format if parsing fails
                    pass
                
                # Extract draw number
                draw_number_element = section.select_one('.draw-card--header .draw-card--draw-number')
                draw_number_text = draw_number_element.text.strip() if draw_number_element else ""
                draw_number = 0
                
                # Extract draw number using regex
                match = re.search(r'(\d+)', draw_number_text)
                if match:
                    draw_number = int(match.group(1))
                
                # Extract winning numbers
                number_elements = section.select('.winning-number')
                white_balls = []
                powerball = 0
                
                if number_elements:
                    for i, elem in enumerate(number_elements):
                        try:
                            num = int(elem.text.strip())
                            if i < len(number_elements) - 1:
                                white_balls.append(num)
                            else:
                                powerball = num
                        except ValueError:
                            pass
            
            # Only return a valid draw if we have the required numbers
            if len(white_balls) == 5 and powerball > 0:
                return {
                    'draw_number': draw_number,
                    'draw_date': draw_date,
                    'white_balls': white_balls,
                    'powerball': powerball,
                    'jackpot_amount': 0,  # Hard to extract consistently
                    'winners': 0,  # Hard to extract consistently
                    'source': 'web_scraping'
                }
            
            return None
        
        except Exception as e:
            logger.error(f"Error parsing web draw section: {str(e)}")
            return None
    
    def _parse_ca_api_draw(self, draw_data: Dict[str, Any]) -> Dict[str, Any]:
        """Parse draw data from the California Lottery API"""
        try:
            draw_number = int(draw_data['drawNumber'])
            
            # Parse draw date (format: MM/DD/YYYY)
            draw_date = draw_data['drawDate']
            if '/' in draw_date:
                month, day, year = draw_date.split('/')
                draw_date = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
            
            # Parse the numbers (format: "12-34-56-78-90-23")
            numbers_str = draw_data['numbers'].split('-')
            
            # Ensure we have exactly 6 numbers (5 white balls + 1 powerball)
            if len(numbers_str) != 6:
                raise ValueError(f"Expected 6 numbers, got {len(numbers_str)}")
            
            white_balls = [int(numbers_str[i].strip()) for i in range(5)]
            powerball = int(numbers_str[5].strip())
            
            # Parse jackpot amount
            jackpot_amount = 0
            if 'jackpot' in draw_data and draw_data['jackpot']:
                jackpot_str = draw_data['jackpot'].replace('$', '').replace(',', '')
                
                # Handle "Million" and "Billion" in the string
                if 'Million' in jackpot_str or 'million' in jackpot_str:
                    jackpot_str = jackpot_str.lower().replace('million', '').strip()
                    jackpot_amount = float(jackpot_str) * 1_000_000
                elif 'Billion' in jackpot_str or 'billion' in jackpot_str:
                    jackpot_str = jackpot_str.lower().replace('billion', '').strip()
                    jackpot_amount = float(jackpot_str) * 1_000_000_000
                else:
                    jackpot_amount = float(jackpot_str)
            
            # Parse winners count
            winners = 0
            if 'winners' in draw_data and draw_data['winners']:
                # Handle various formats ('None', '1 Winner', etc.)
                if isinstance(draw_data['winners'], str):
                    if draw_data['winners'].lower() == 'none':
                        winners = 0
                    else:
                        # Try to extract the number
                        match = re.search(r'(\d+)', draw_data['winners'])
                        if match:
                            winners = int(match.group(1))
                elif isinstance(draw_data['winners'], int):
                    winners = draw_data['winners']
            
            return {
                'draw_number': draw_number,
                'draw_date': draw_date,
                'white_balls': white_balls,
                'powerball': powerball,
                'jackpot_amount': jackpot_amount,
                'winners': winners,
                'source': 'ca_api'
            }
        
        except Exception as e:
            logger.error(f"Error parsing CA API draw: {str(e)}")
            logger.error(f"Raw draw data: {json.dumps(draw_data)}")
            
            # Return at least a partial result if possible
            result = {
                'draw_number': draw_data.get('drawNumber', 0),
                'draw_date': draw_data.get('drawDate', '1970-01-01'),
                'white_balls': [0, 0, 0, 0, 0],
                'powerball': 0,
                'jackpot_amount': 0,
                'winners': 0,
                'source': 'ca_api',
                'parse_error': str(e)
            }
            
            # Try to extract whatever numbers we can
            if 'numbers' in draw_data and draw_data['numbers']:
                try:
                    numbers_str = draw_data['numbers'].split('-')
                    if len(numbers_str) >= 5:
                        result['white_balls'] = [int(numbers_str[i].strip()) for i in range(5)]
                    if len(numbers_str) >= 6:
                        result['powerball'] = int(numbers_str[5].strip())
                except Exception:
                    pass
            
            return result
    
    def _generate_mock_draw(self) -> Dict[str, Any]:
        """Generate a mock draw for testing or when all fetch methods fail"""
        # Get the current date
        today = datetime.now()
        draw_date = today.strftime("%Y-%m-%d")
        
        # Generate a random draw number
        draw_number = random.randint(1000, 2000)
        
        # Generate 5 unique random white balls (1-69)
        white_balls = sorted(random.sample(range(1, 70), 5))
        
        # Generate random powerball (1-26)
        powerball = random.randint(1, 26)
        
        # Generate random jackpot amount (typical range)
        jackpot_amount = random.randint(50, 500) * 1_000_000
        
        return {
            'draw_number': draw_number,
            'draw_date': draw_date,
            'white_balls': white_balls,
            'powerball': powerball,
            'jackpot_amount': jackpot_amount,
            'winners': 0,
            'source': 'mock_data'
        }
    
    def _generate_mock_historical_draws(self, count: int) -> List[Dict[str, Any]]:
        """Generate mock historical draws for testing"""
        draws = []
        
        # Start from today and go backward
        today = datetime.now()
        
        for i in range(count):
            # Generate draw date (every 3-4 days backwards)
            days_back = i * random.randint(3, 4)
            draw_date = (today - timedelta(days=days_back)).strftime("%Y-%m-%d")
            
            # Generate draw number (descending)
            draw_number = 2000 - i
            
            # Generate 5 unique random white balls (1-69)
            white_balls = sorted(random.sample(range(1, 70), 5))
            
            # Generate random powerball (1-26)
            powerball = random.randint(1, 26)
            
            # Generate random jackpot amount (growing as we go further back in time)
            base_amount = random.randint(20, 50) * 1_000_000
            growth_factor = 1 + (i * 0.05)  # 5% increase per draw
            jackpot_amount = int(base_amount * growth_factor)
            
            # Occasionally have a winner
            winners = random.choices([0, 1, 2], weights=[0.9, 0.09, 0.01])[0]
            if winners > 0:
                # Reset jackpot after a win
                jackpot_amount = random.randint(20, 40) * 1_000_000
            
            draws.append({
                'draw_number': draw_number,
                'draw_date': draw_date,
                'white_balls': white_balls,
                'powerball': powerball,
                'jackpot_amount': jackpot_amount,
                'winners': winners,
                'source': 'mock_data'
            })
        
        return draws

# For testing
if __name__ == "__main__":
    import asyncio
    
    async def test_scraper():
        scraper = PowerballScraper()
        
        print("Testing fetch_latest_draw...")
        latest = await scraper.fetch_latest_draw()
        print(f"Latest draw: {json.dumps(latest, indent=2)}")
        
        print("\nTesting fetch_historical_draws...")
        historical = await scraper.fetch_historical_draws(count=3)
        print(f"Historical draws ({len(historical)} draws):")
        for draw in historical:
            print(f"Draw #{draw['draw_number']} on {draw['draw_date']}: {draw['white_balls']} - {draw['powerball']}")
    
    asyncio.run(test_scraper())
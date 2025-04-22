import asyncio
import httpx
import logging
import random
import re
import json
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
from fake_useragent import UserAgent
from tenacity import retry, stop_after_attempt, wait_fixed, retry_if_exception_type

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("powerball-scraper")

class PowerballScraper:
    """
    Scraper for Powerball results from official sources
    Prioritizes CalLottery for draw numbers and fallbacks to Powerball.com
    """
    
    def __init__(self):
        """Initialize the Powerball scraper"""
        self.user_agent = UserAgent()
        # Updated California Lottery API for Powerball (game ID 12)
        self.ca_api_url = "https://www.calottery.com/api/DrawGameApi/DrawGamePastDrawResults/12/1/20"
        # Backup URL for web scraping
        self.ca_web_url = "https://www.calottery.com/draw-games/powerball"
        # Official Powerball website
        self.powerball_url = "https://www.powerball.com"
        # Powerball previous results page
        self.powerball_history_url = "https://www.powerball.com/previous-results"
        
        # Store the latest known draw number for incrementing
        self.latest_draw_number = 0
        
        logger.info(f"Powerball scraper initialized")
    
    async def fetch_latest_draw(self) -> Dict[str, Any]:
        """
        Fetch the latest Powerball draw
        
        Returns:
            dict: The latest draw data
        """
        logger.info("Fetching latest Powerball draw...")
        
        # Try CalLottery API first for the draw number
        try:
            draw = await self._fetch_from_ca_api()
            if draw:
                self.latest_draw_number = max(self.latest_draw_number, draw.get('draw_number', 0))
                return draw
        except Exception as e:
            logger.error(f"Error fetching from CalLottery API: {str(e)}")
        
        # Try CalLottery website
        try:
            draw = await self._fetch_from_ca_web()
            if draw:
                self.latest_draw_number = max(self.latest_draw_number, draw.get('draw_number', 0))
                return draw
        except Exception as e:
            logger.error(f"Error fetching from CalLottery web: {str(e)}")
        
        # Fall back to Powerball.com
        try:
            # Try to get from Powerball.com main page
            draw = await self._fetch_from_powerball_main()
            if draw:
                # If we have a previous draw number, assign the next number
                if self.latest_draw_number > 0:
                    draw['draw_number'] = self.latest_draw_number + 1
                self.latest_draw_number = max(self.latest_draw_number, draw.get('draw_number', 0))
                return draw
                
            # If that fails, try the history page
            draw = await self._fetch_from_powerball_history()
            if draw:
                # If we have a previous draw number, assign the next number
                if self.latest_draw_number > 0 and draw.get('draw_number', 0) == 0:
                    draw['draw_number'] = self.latest_draw_number + 1
                self.latest_draw_number = max(self.latest_draw_number, draw.get('draw_number', 0))
                return draw
        except Exception as e:
            logger.error(f"Error fetching from Powerball site: {str(e)}")
        
        # Fall back to mock data as a last resort
        logger.warning("All fetch methods failed, generating mock data")
        mock_draw = self._generate_mock_draw()
        if self.latest_draw_number > 0:
            mock_draw['draw_number'] = self.latest_draw_number + 1
        self.latest_draw_number = max(self.latest_draw_number, mock_draw.get('draw_number', 0))
        return mock_draw
    
    async def fetch_historical_draws(self, count: int = 20) -> List[Dict[str, Any]]:
        """
        Fetch historical Powerball draws
        
        Args:
            count: Number of historical draws to fetch
        
        Returns:
            list: The historical draw data
        """
        logger.info(f"Fetching {count} historical Powerball draws...")
        
        # Try CalLottery API first
        try:
            draws = await self._fetch_historical_from_ca_api(count)
            if draws:
                # Update latest draw number
                for draw in draws:
                    self.latest_draw_number = max(self.latest_draw_number, draw.get('draw_number', 0))
                return draws
        except Exception as e:
            logger.error(f"Error fetching historical draws from CA API: {str(e)}")
        
        # Try Powerball.com as backup
        try:
            draw = await self.fetch_latest_draw()  # Get at least the latest draw
            if draw and draw.get('source') != 'mock_data':
                return [draw]
        except Exception as e:
            logger.error(f"Error fetching latest draw for historical: {str(e)}")
        
        # Fall back to mock data
        logger.warning("Historical fetch methods failed, generating mock data")
        mock_draws = self._generate_mock_historical_draws(count)
        
        # If we have a latest draw number, assign sequential numbers to mock draws
        if self.latest_draw_number > 0:
            for i, draw in enumerate(mock_draws):
                draw['draw_number'] = self.latest_draw_number - i
        
        # Update latest draw number
        for draw in mock_draws:
            self.latest_draw_number = max(self.latest_draw_number, draw.get('draw_number', 0))
            
        return mock_draws
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_fixed(2),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException))
    )
    async def _fetch_from_ca_api(self) -> Optional[Dict[str, Any]]:
        """Fetch the latest draw from the updated California Lottery API"""
        headers = {
            'User-Agent': self.user_agent.random,
            'Accept': 'application/json',
            'Referer': 'https://www.calottery.com/draw-games/powerball'
        }
        
        logger.info(f"Requesting from CalLottery API: {self.ca_api_url}")
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(self.ca_api_url, headers=headers)
            response.raise_for_status()
            data = response.json()
            
            if not data or 'PreviousDraws' not in data or not data['PreviousDraws']:
                logger.warning("No results found in CA API response")
                return None
            
            # Parse the first result (latest draw)
            latest = data['PreviousDraws'][0]  # Get the first draw
            return self._parse_ca_api_draw(latest)
    
    def _parse_ca_api_draw(self, draw_data: Dict[str, Any]) -> Dict[str, Any]:
        """Parse draw data from the updated California Lottery API"""
        try:
            # Extract draw number
            draw_number = int(draw_data['DrawNumber'])
            
            # Parse draw date (format: YYYY-MM-DDThh:mm:ss)
            draw_date = draw_data['DrawDate']
            if 'T' in draw_date:
                draw_date = draw_date.split('T')[0]  # Extract just the date part
            elif '/' in draw_date:
                month, day, year = draw_date.split('/')
                draw_date = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
            
            # Parse the winning numbers
            white_balls = []
            powerball = 0
            
            # WinningNumbers is a dictionary with string keys
            for i in range(5):
                white_balls.append(int(draw_data['WinningNumbers'][str(i)]['Number']))
            # Get powerball (usually at index 5)
            powerball = int(draw_data['WinningNumbers']['5']['Number'])
            
            # Parse jackpot and winners info from prizes
            jackpot_amount = 0
            winners = 0
            prize_breakdown = []
            
            # Process prize information
            if 'Prizes' in draw_data and isinstance(draw_data['Prizes'], dict):
                # Create prize breakdown details
                prize_tiers = [
                    {"name": "5 + Powerball", "key": "1"},
                    {"name": "5", "key": "2"},
                    {"name": "4 + Powerball", "key": "3"},
                    {"name": "4", "key": "4"},
                    {"name": "3 + Powerball", "key": "5"},
                    {"name": "3", "key": "6"},
                    {"name": "2 + Powerball", "key": "7"},
                    {"name": "1 + Powerball", "key": "8"},
                    {"name": "Powerball", "key": "9"}
                ]
                
                for tier in prize_tiers:
                    if tier["key"] in draw_data['Prizes']:
                        prize_info = draw_data['Prizes'][tier["key"]]
                        prize_breakdown.append({
                            "tier": tier["name"],
                            "winners": prize_info.get("Count", 0),
                            "prize": prize_info.get("Amount", "$0")
                        })
                        
                        # Set jackpot amount from the first tier
                        if tier["key"] == "1" and "Amount" in prize_info:
                            try:
                                jackpot_str = str(prize_info["Amount"]).replace("$", "").replace(",", "")
                                jackpot_amount = float(jackpot_str)
                            except ValueError:
                                pass
                        
                        # Set winners count from the first tier
                        if tier["key"] == "1" and "Count" in prize_info:
                            try:
                                winners = int(prize_info["Count"])
                            except ValueError:
                                pass
            
            # Calculate total winning tickets
            total_winners = 0
            for prize in prize_breakdown:
                total_winners += int(prize["winners"])
                
            return {
                'draw_number': draw_number,
                'draw_date': draw_date,
                'white_balls': white_balls,
                'powerball': powerball,
                'jackpot_amount': jackpot_amount,
                'winners': winners,
                'prize_breakdown': prize_breakdown,
                'total_winners': total_winners,
                'source': 'ca_api'
            }
        
        except Exception as e:
            logger.error(f"Error parsing CA API draw: {str(e)}")
            return None
        
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_fixed(2),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException))
    )
    async def _fetch_from_ca_web(self) -> Optional[Dict[str, Any]]:
        """Fetch the latest draw by scraping the California Lottery website"""
        headers = {
            'User-Agent': self.user_agent.random,
            'Accept': 'text/html,application/xhtml+xml,application/xml',
            'Accept-Language': 'en-US,en;q=0.9'
        }
        
        logger.info(f"Requesting from CalLottery web: {self.ca_web_url}")
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            response = await client.get(self.ca_web_url, headers=headers)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Find the latest draw section
            draw_section = soup.select_one('.draw-cards .draw-card')
            if not draw_section:
                logger.warning("Could not find draw section in CalLottery web page")
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
            
            # Extract winner information
            winners_element = draw_section.select_one('.has-winners')
            winners = 0
            if winners_element:
                # Try to extract number of winners
                match = re.search(r'(\d+)\s+winner', winners_element.text.lower())
                if match:
                    winners = int(match.group(1))
                else:
                    # If it just says "Winner" or similar, assume 1
                    if 'winner' in winners_element.text.lower():
                        winners = 1
            
            # Construct result
            if len(white_balls) == 5 and powerball > 0:
                return {
                    'draw_number': draw_number,
                    'draw_date': draw_date,
                    'white_balls': white_balls,
                    'powerball': powerball,
                    'jackpot_amount': jackpot_amount,
                    'winners': winners,
                    'source': 'ca_web'
                }
            
            return None
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_fixed(2),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException))
    )
    async def _fetch_historical_from_ca_api(self, count: int) -> List[Dict[str, Any]]:
        """Fetch historical draws from the updated California Lottery API"""
        headers = {
            'User-Agent': self.user_agent.random,
            'Accept': 'application/json',
            'Referer': 'https://www.calottery.com/draw-games/powerball'
        }
        
        # Calculate number of pages needed (20 results per page)
        pages = (count + 19) // 20
        all_draws = []
        
        logger.info(f"Requesting historical draws from CalLottery API")
        async with httpx.AsyncClient(timeout=15.0) as client:
            for page in range(1, pages + 1):
                url = f"https://www.calottery.com/api/DrawGameApi/DrawGamePastDrawResults/12/{page}/20"
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                data = response.json()
                
                if not data or 'PreviousDraws' not in data or not data['PreviousDraws']:
                    break
                
                draws = []
                for draw_data in data['PreviousDraws']:
                    draw = self._parse_ca_api_draw(draw_data)
                    if draw:
                        draws.append(draw)
                
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
    async def _fetch_from_powerball_main(self) -> Optional[Dict[str, Any]]:
        """Fetch the latest draw from the Powerball.com main page"""
        headers = {
            'User-Agent': self.user_agent.random,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
        }
        
        logger.info(f"Requesting from Powerball.com main: {self.powerball_url}")
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            response = await client.get(self.powerball_url, headers=headers)
            response.raise_for_status()
            
            html = response.text
            logger.info(f"Received HTML response of length: {len(html)}")
            
            # Try to extract using regex patterns
            date_pattern = r'(?:draw date|draw was).*?([A-Za-z]+\s+\d{1,2},?\s+\d{4})'
            date_match = re.search(date_pattern, html, re.IGNORECASE)
            
            draw_num_pattern = r'(?:draw number|draw #).*?(\d+)'
            draw_num_match = re.search(draw_num_pattern, html, re.IGNORECASE)
            
            # Look for 5 numbers followed by a powerball number
            numbers_pattern = r'(\d{1,2}).*?(\d{1,2}).*?(\d{1,2}).*?(\d{1,2}).*?(\d{1,2}).*?(?:powerball|power\s*ball).*?(\d{1,2})'
            numbers_match = re.search(numbers_pattern, html, re.IGNORECASE | re.DOTALL)
            
            # Extract date
            draw_date = datetime.now().strftime("%Y-%m-%d")  # Default to today
            if date_match:
                date_str = date_match.group(1)
                try:
                    # Try to parse with various formats
                    for fmt in ["%B %d, %Y", "%b %d, %Y", "%B %d %Y", "%b %d %Y"]:
                        try:
                            draw_date = datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
                            break
                        except ValueError:
                            continue
                except Exception as e:
                    logger.warning(f"Could not parse date '{date_str}': {e}")
            
            # Extract draw number
            draw_number = 0
            if draw_num_match:
                try:
                    draw_number = int(draw_num_match.group(1))
                except ValueError:
                    logger.warning(f"Could not parse draw number: {draw_num_match.group(1)}")
            
            # Extract numbers
            white_balls = []
            powerball = 0
            if numbers_match:
                try:
                    white_balls = [int(numbers_match.group(i)) for i in range(1, 6)]
                    powerball = int(numbers_match.group(6))
                except ValueError:
                    logger.warning("Could not parse numbers")
            
            # If no regex match, try to find numbers using BeautifulSoup
            if not white_balls or not powerball:
                soup = BeautifulSoup(html, 'html.parser')
                
                # Look for number elements
                number_elements = soup.select('.number, .draw-number, .ball, div.number, span.number')
                if len(number_elements) >= 6:
                    try:
                        white_balls = [int(number_elements[i].text.strip()) for i in range(5)]
                        powerball = int(number_elements[5].text.strip())
                    except (ValueError, IndexError):
                        logger.warning("Could not parse number elements")
            
            # As a last resort, just look for any 6 numbers in sequence
            if not white_balls or not powerball:
                all_numbers = re.findall(r'\b\d{1,2}\b', html)
                if len(all_numbers) >= 6:
                    # Try to find clusters of 6 numbers (5 white + 1 power)
                    for i in range(len(all_numbers) - 5):
                        potential_balls = [int(all_numbers[i+j]) for j in range(6)]
                        if all(1 <= ball <= 69 for ball in potential_balls[:5]) and 1 <= potential_balls[5] <= 26:
                            white_balls = potential_balls[:5]
                            powerball = potential_balls[5]
                            break
            
            # Try to extract jackpot amount
            jackpot_amount = 0
            jackpot_pattern = r'\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:Million|Billion)?'
            jackpot_match = re.search(jackpot_pattern, html, re.IGNORECASE)
            
            if jackpot_match:
                try:
                    jackpot_text = jackpot_match.group(0)
                    # Remove $ and commas
                    jackpot_text = jackpot_text.replace('$', '').replace(',', '')
                    
                    # Handle "Million" and "Billion"
                    if 'Million' in jackpot_text or 'million' in jackpot_text:
                        jackpot_text = re.sub(r'[Mm]illion', '', jackpot_text).strip()
                        jackpot_amount = float(jackpot_text) * 1_000_000
                    elif 'Billion' in jackpot_text or 'billion' in jackpot_text:
                        jackpot_text = re.sub(r'[Bb]illion', '', jackpot_text).strip()
                        jackpot_amount = float(jackpot_text) * 1_000_000_000
                    else:
                        jackpot_amount = float(jackpot_text)
                except (ValueError, TypeError):
                    jackpot_amount = 0
            
            # If we have the numbers, construct a result
            if len(white_balls) == 5 and powerball > 0:
                result = {
                    'draw_number': draw_number,
                    'draw_date': draw_date,
                    'white_balls': white_balls,
                    'powerball': powerball,
                    'jackpot_amount': jackpot_amount,
                    'winners': 0,  # Hard to extract from main page
                    'source': 'powerball.com'
                }
                logger.info(f"Successfully extracted draw from Powerball.com: {white_balls} / {powerball}")
                return result
            
            return None
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_fixed(2),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException))
    )
    async def _fetch_from_powerball_history(self) -> Optional[Dict[str, Any]]:
        """Fetch from the Powerball.com previous results page"""
        headers = {
            'User-Agent': self.user_agent.random,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
        }
        
        logger.info(f"Requesting from Powerball.com history: {self.powerball_history_url}")
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            response = await client.get(self.powerball_history_url, headers=headers)
            response.raise_for_status()
            
            html = response.text
            logger.info(f"Received history HTML of length: {len(html)}")
            
            # Use regex for a broad pattern match
            draw_pattern = r'([A-Za-z]+\s+\d{1,2},?\s+\d{4}).*?#?(\d+)?.*?(\d{1,2}).*?(\d{1,2}).*?(\d{1,2}).*?(\d{1,2}).*?(\d{1,2}).*?(?:powerball|power\s*ball|pb).*?(\d{1,2})'
            match = re.search(draw_pattern, html, re.IGNORECASE | re.DOTALL)
            
            if match:
                # Extract date
                date_str = match.group(1)
                try:
                    for fmt in ["%B %d, %Y", "%b %d, %Y", "%B %d %Y", "%b %d %Y"]:
                        try:
                            draw_date = datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
                            break
                        except ValueError:
                            continue
                except Exception:
                    draw_date = datetime.now().strftime("%Y-%m-%d")
                
                # Extract draw number
                draw_number = 0
                if match.group(2):
                    try:
                        draw_number = int(match.group(2))
                    except ValueError:
                        pass
                
                # Extract numbers
                try:
                    white_balls = [int(match.group(i)) for i in range(3, 8)]
                    powerball = int(match.group(8))
                    
                    # Try to extract jackpot amount
                    jackpot_amount = 0
                    jackpot_pattern = r'\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:Million|Billion)?'
                    jackpot_match = re.search(jackpot_pattern, html, re.IGNORECASE)
                    
                    if jackpot_match:
                        try:
                            jackpot_text = jackpot_match.group(0)
                            # Remove $ and commas
                            jackpot_text = jackpot_text.replace('$', '').replace(',', '')
                            
                            # Handle "Million" and "Billion"
                            if 'Million' in jackpot_text or 'million' in jackpot_text:
                                jackpot_text = re.sub(r'[Mm]illion', '', jackpot_text).strip()
                                jackpot_amount = float(jackpot_text) * 1_000_000
                            elif 'Billion' in jackpot_text or 'billion' in jackpot_text:
                                jackpot_text = re.sub(r'[Bb]illion', '', jackpot_text).strip()
                                jackpot_amount = float(jackpot_text) * 1_000_000_000
                            else:
                                jackpot_amount = float(jackpot_text)
                        except (ValueError, TypeError):
                            jackpot_amount = 0
                    
                    result = {
                        'draw_number': draw_number,
                        'draw_date': draw_date,
                        'white_balls': white_balls,
                        'powerball': powerball,
                        'jackpot_amount': jackpot_amount,
                        'winners': 0, # Hard to extract reliably
                        'source': 'powerball.com'
                    }
                    logger.info(f"Successfully extracted draw from history: {white_balls} / {powerball}")
                    return result
                except (ValueError, IndexError):
                    logger.warning("Could not extract numbers from history page")
            
            return None
    
    def _generate_mock_draw(self) -> Dict[str, Any]:
        """Generate a mock draw for testing or when all fetch methods fail"""
        # Get the current date
        today = datetime.now()
        draw_date = today.strftime("%Y-%m-%d")
        
        # Generate a random draw number if we don't have a latest one
        draw_number = (self.latest_draw_number + 1) if self.latest_draw_number > 0 else random.randint(1000, 2000)
        
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
        
        # Use latest known draw number if available
        start_draw_number = self.latest_draw_number if self.latest_draw_number > 0 else 2000
        
        for i in range(count):
            # Generate draw date (every 3-4 days backwards)
            days_back = i * random.randint(3, 4)
            draw_date = (today - timedelta(days=days_back)).strftime("%Y-%m-%d")
            
            # Generate draw number (descending)
            draw_number = start_draw_number - i
            
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
                jackpot_amount = random.randint(20, 40) * 1
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
    
    async def enhance_draw_with_details(self, draw: Dict[str, Any]) -> Dict[str, Any]:
        """
        Enhance a draw with additional details from Powerball.com
        Used when we have basic draw info from CalLottery but want prize breakdowns
        """
        # If this is already complete, return as is
        if draw.get('jackpot_amount', 0) > 0 and draw.get('source') != 'mock_data':
            return draw
            
        try:
            # Try to get detailed draw info from Powerball.com
            pb_draw = await self._fetch_from_powerball_main()
            
            if pb_draw:
                # Check if the numbers match
                if sorted(draw['white_balls']) == sorted(pb_draw['white_balls']) and draw['powerball'] == pb_draw['powerball']:
                    # Numbers match, update jackpot and winners if needed
                    if pb_draw.get('jackpot_amount', 0) > 0 and draw.get('jackpot_amount', 0) == 0:
                        draw['jackpot_amount'] = pb_draw['jackpot_amount']
                    
                    if pb_draw.get('winners', 0) > 0 and draw.get('winners', 0) == 0:
                        draw['winners'] = pb_draw['winners']
                        
                    # Mark as enhanced
                    draw['source'] = f"{draw['source']}_enhanced"
        except Exception as e:
            logger.error(f"Error enhancing draw with details: {str(e)}")
        
        return draw
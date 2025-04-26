# backend/scraper.py
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
    Prioritizes CalLottery for draw numbers and falls back to Powerball.com
    """
    
    def __init__(self):
        """Initialize the Powerball scraper"""
        self.user_agent = UserAgent()
        self.ca_api_url = "https://www.calottery.com/api/DrawGameApi/DrawGamePastDrawResults/12/1/20"
        self.ca_web_url = "https://www.calottery.com/draw-games/powerball"
        self.powerball_url = "https://www.powerball.com"
        self.powerball_history_url = "https://www.powerball.com/previous-results"
        self.latest_draw_number = 0
        logger.info("Powerball scraper initialized")
    
    async def fetch_latest_draw(self) -> Dict[str, Any]:
        """
        Fetch the latest Powerball draw
        
        Returns:
            dict: The latest draw data
        """
        logger.info("Fetching latest Powerball draw...")
        
        try:
            draw = await self._fetch_from_ca_api()
            if draw:
                self.latest_draw_number = max(self.latest_draw_number, draw.get('draw_number', 0))
                return draw
        except Exception as e:
            logger.error(f"Error fetching from CalLottery API: {str(e)}")
        
        try:
            draw = await self._fetch_from_ca_web()
            if draw:
                self.latest_draw_number = max(self.latest_draw_number, draw.get('draw_number', 0))
                return draw
        except Exception as e:
            logger.error(f"Error fetching from CalLottery web: {str(e)}")
        
        try:
            draw = await self._fetch_from_powerball_main()
            if draw:
                if self.latest_draw_number > 0:
                    draw['draw_number'] = self.latest_draw_number + 1
                self.latest_draw_number = max(self.latest_draw_number, draw.get('draw_number', 0))
                return draw
        except Exception as e:
            logger.error(f"Error fetching from Powerball.com main: {str(e)}")
        
        try:
            draw = await self._fetch_from_powerball_history()
            if draw:
                if self.latest_draw_number > 0:
                    draw['draw_number'] = self.latest_draw_number + 1
                self.latest_draw_number = max(self.latest_draw_number, draw.get('draw_number', 0))
                return draw
        except Exception as e:
            logger.error(f"Error fetching from Powerball.com history: {str(e)}")
        
        logger.warning("All fetch methods failed, generating mock data")
        mock_draw = self._generate_mock_draw()
        if self.latest_draw_number > 0:
            mock_draw['draw_number'] = self.latest_draw_number + 1
        self.latest_draw_number = max(self.latest_draw_number, mock_draw.get('draw_number', 0))
        return mock_draw
    
    async def fetch_historical_draws(self, count: int = 20) -> List[Dict[str, Any]]:
        """
        Fetch historical Powerball draws, starting with CalLottery then switching to Powerball.com
        
        Args:
            count: Number of historical draws to fetch
        
        Returns:
            list: The historical draw data
        """
        logger.info(f"Fetching {count} historical Powerball draws...")
        all_draws = []
        
        try:
            ca_draws = await self._fetch_historical_from_ca_api(max_count=118)
            if ca_draws:
                all_draws.extend(ca_draws)
                self.latest_draw_number = max(self.latest_draw_number, max(d.get('draw_number', 0) for d in ca_draws))
                logger.info(f"Fetched {len(ca_draws)} draws from CalLottery")
        except Exception as e:
            logger.error(f"Error fetching historical draws from CalLottery API: {str(e)}")
        
        remaining_count = count - len(all_draws)
        if remaining_count > 0:
            try:
                pb_draws = await self._fetch_historical_from_powerball(remaining_count)
                for i, draw in enumerate(pb_draws):
                    draw['draw_number'] = self.latest_draw_number - len(all_draws) - i
                all_draws.extend(pb_draws)
                self.latest_draw_number = max(self.latest_draw_number, max(d.get('draw_number', 0) for d in pb_draws))
                logger.info(f"Fetched {len(pb_draws)} additional draws from Powerball.com")
            except Exception as e:
                logger.error(f"Error fetching historical draws from Powerball.com: {str(e)}")
        
        if len(all_draws) < count:
            logger.warning(f"Only fetched {len(all_draws)} draws, generating mock data for {count - len(all_draws)} more")
            mock_draws = self._generate_mock_historical_draws(count - len(all_draws))
            for i, draw in enumerate(mock_draws):
                draw['draw_number'] = self.latest_draw_number - len(all_draws) - i
            all_draws.extend(mock_draws)
            self.latest_draw_number = max(self.latest_draw_number, max(d.get('draw_number', 0) for d in mock_draws))
        
        return all_draws[:count]
    
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
        
        logger.info(f"Requesting from CalLottery API: {self.ca_api_url}")
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(self.ca_api_url, headers=headers)
            response.raise_for_status()
            data = response.json()
            
            if not data or 'PreviousDraws' not in data or not data['PreviousDraws']:
                logger.warning("No results found in CA API response")
                return None
            
            latest = data['PreviousDraws'][0]
            return self._parse_ca_api_draw(latest)
    
    def _parse_ca_api_draw(self, draw_data: Dict[str, Any]) -> Dict[str, Any]:
        """Parse draw data from the California Lottery API"""
        try:
            # Handle case variations for draw number
            draw_number = int(draw_data.get('DrawNumber', draw_data.get('drawNumber', 0)))
            if draw_number == 0:
                raise ValueError("Invalid draw number")
            
            # Parse draw date
            draw_date = draw_data.get('DrawDate', '')
            if 'T' in draw_date:
                draw_date = draw_date.split('T')[0]  # Extract YYYY-MM-DD
            elif '/' in draw_date:
                month, day, year = draw_date.split('/')
                draw_date = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
            else:
                raise ValueError("Invalid date format")
            
            # Parse winning numbers
            winning_numbers = draw_data.get('WinningNumbers', {})
            white_balls = []
            powerball = 0
            for i in range(5):
                if str(i) in winning_numbers:
                    white_balls.append(int(winning_numbers[str(i)]['Number']))
                else:
                    raise ValueError(f"Missing white ball {i}")
            if '5' in winning_numbers and winning_numbers['5'].get('IsSpecial', False):
                powerball = int(winning_numbers['5']['Number'])
            else:
                raise ValueError("Missing powerball")
            
            # Parse jackpot amount
            jackpot_amount = 0
            prizes = draw_data.get('Prizes', {})
            if '1' in prizes and 'Amount' in prizes['1']:
                jackpot_amount = float(prizes['1']['Amount'])
            
            # Parse winners
            winners = 0
            if '1' in prizes and 'Count' in prizes['1']:
                winners = int(prizes['1']['Count'])
            
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
            
            # Return fallback result
            return {
                'draw_number': draw_data.get('DrawNumber', draw_data.get('drawNumber', 0)),
                'draw_date': draw_data.get('DrawDate', '1970-01-01').split('T')[0],
                'white_balls': [0, 0, 0, 0, 0],
                'powerball': 0,
                'jackpot_amount': 0,
                'winners': 0,
                'source': 'ca_api',
                'parse_error': str(e)
            }
    
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
            
            draw_section = soup.select_one('.draw-cards .draw-card')
            if not draw_section:
                logger.warning("Could not find draw section in CalLottery web page")
                return None
            
            date_element = draw_section.select_one('.draw-card--header time')
            draw_date = date_element.text.strip() if date_element else "Unknown Date"
            
            try:
                date_obj = datetime.strptime(draw_date, "%A, %B %d, %Y")
                draw_date = date_obj.strftime("%Y-%m-%d")
            except ValueError:
                pass
            
            draw_number_element = draw_section.select_one('.draw-card--header .draw-card--draw-number')
            draw_number_text = draw_number_element.text.strip() if draw_number_element else ""
            draw_number = 0
            
            match = re.search(r'(\d+)', draw_number_text)
            if match:
                draw_number = int(match.group(1))
            
            number_elements = draw_section.select('.winning-number')
            white_balls = []
            powerball = 0
            
            if number_elements:
                for i, elem in enumerate(number_elements):
                    num = int(elem.text.strip())
                    if i < len(number_elements) - 1:
                        white_balls.append(num)
                    else:
                        powerball = num
            
            jackpot_element = draw_section.select_one('.draw-card--prize-amount')
            jackpot_text = jackpot_element.text.strip() if jackpot_element else "$0"
            
            jackpot_amount = 0
            try:
                jackpot_text = jackpot_text.replace('$', '').replace(',', '')
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
            
            winners_element = draw_section.select_one('.has-winners')
            winners = 0
            if winners_element:
                match = re.search(r'(\d+)\s+winner', winners_element.text.lower())
                if match:
                    winners = int(match.group(1))
                else:
                    if 'winner' in winners_element.text.lower():
                        winners = 1
            
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
    async def _fetch_historical_from_ca_api(self, max_count: int) -> List[Dict[str, Any]]:
        """Fetch historical draws from the California Lottery API"""
        headers = {
            'User-Agent': self.user_agent.random,
            'Accept': 'application/json',
            'Referer': 'https://www.calottery.com/draw-games/powerball'
        }
        
        all_draws = []
        page = 1
        max_pages = (max_count + 19) // 20
        
        logger.info(f"Requesting historical draws from CalLottery API (max {max_count} draws)")
        async with httpx.AsyncClient(timeout=15.0) as client:
            while page <= max_pages and len(all_draws) < max_count:
                url = f"https://www.calottery.com/api/DrawGameApi/DrawGamePastDrawResults/12/{page}/20"
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                data = response.json()
                
                if not data or 'PreviousDraws' not in data or not data['PreviousDraws']:
                    logger.info(f"No more draws available after page {page}")
                    break
                
                draws = []
                for draw_data in data['PreviousDraws']:
                    draw = self._parse_ca_api_draw(draw_data)
                    if draw:
                        draws.append(draw)
                
                all_draws.extend(draws)
                logger.info(f"Fetched {len(draws)} draws from CalLottery page {page}")
                
                page += 1
                await asyncio.sleep(random.uniform(1.0, 2.0))
            
            return all_draws[:max_count]
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_fixed(2),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException))
    )
    async def _fetch_historical_from_powerball(self, count: int) -> List[Dict[str, Any]]:
        """Fetch historical draws from Powerball.com"""
        headers = {
            'User-Agent': self.user_agent.random,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
        }
        
        logger.info(f"Requesting historical draws from Powerball.com history: {self.powerball_history_url}")
        all_draws = []
        
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            response = await client.get(self.powerball_history_url, headers=headers)
            response.raise_for_status()
            
            html = response.text
            soup = BeautifulSoup(html, 'html.parser')
            
            draw_elements = soup.select('.draw-result')
            for draw_elem in draw_elements[:count]:
                try:
                    date_elem = draw_elem.select_one('.draw-date')
                    date_str = date_elem.text.strip() if date_elem else ""
                    try:
                        date_obj = datetime.strptime(date_str, "%B %d, %Y")
                        draw_date = date_obj.strftime("%Y-%m-%d")
                    except ValueError:
                        draw_date = datetime.now().strftime("%Y-%m-%d")
                    
                    number_elems = draw_elem.select('.number')
                    white_balls = []
                    powerball = 0
                    if len(number_elems) >= 6:
                        white_balls = [int(num.text.strip()) for num in number_elems[:5]]
                        powerball = int(number_elems[5].text.strip())
                    
                    jackpot_elem = draw_elem.select_one('.jackpot-amount')
                    jackpot_amount = 0
                    if jackpot_elem:
                        jackpot_text = jackpot_elem.text.strip().replace('$', '').replace(',', '')
                        if 'Million' in jackpot_text:
                            jackpot_text = jackpot_text.replace('Million', '').strip()
                            jackpot_amount = float(jackpot_text) * 1_000_000
                        elif 'Billion' in jackpot_text:
                            jackpot_text = jackpot_text.replace('Billion', '').strip()
                            jackpot_amount = float(jackpot_text) * 1_000_000_000
                        else:
                            jackpot_amount = float(jackpot_text)
                    
                    winners = 0
                    winner_elem = draw_elem.select_one('.winner-info')
                    if winner_elem and 'winner' in winner_elem.text.lower():
                        winners = 1
                    
                    if len(white_balls) == 5 and powerball > 0:
                        draw = {
                            'draw_number': 0,  # Will be set by caller
                            'draw_date': draw_date,
                            'white_balls': white_balls,
                            'powerball': powerball,
                            'jackpot_amount': jackpot_amount,
                            'winners': winners,
                            'source': 'powerball.com'
                        }
                        all_draws.append(draw)
                
                except Exception as e:
                    logger.warning(f"Error parsing Powerball.com draw: {str(e)}")
                    continue
            
            return all_draws
    
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
            soup = BeautifulSoup(html, 'html.parser')
            
            date_elem = soup.select_one('.draw-date')
            draw_date = datetime.now().strftime("%Y-%m-%d")
            if date_elem:
                date_str = date_elem.text.strip()
                try:
                    date_obj = datetime.strptime(date_str, "%B %d, %Y")
                    draw_date = date_obj.strftime("%Y-%m-%d")
                except ValueError:
                    pass
            
            number_elems = soup.select('.number')
            white_balls = []
            powerball = 0
            if len(number_elems) >= 6:
                try:
                    white_balls = [int(num.text.strip()) for num in number_elems[:5]]
                    powerball = int(number_elems[5].text.strip())
                except ValueError:
                    logger.warning("Could not parse numbers from Powerball.com main")
            
            jackpot_amount = 0
            jackpot_elem = soup.select_one('.jackpot-amount')
            if jackpot_elem:
                jackpot_text = jackpot_elem.text.strip().replace('$', '').replace(',', '')
                try:
                    if 'Million' in jackpot_text:
                        jackpot_text = jackpot_text.replace('Million', '').strip()
                        jackpot_amount = float(jackpot_text) * 1_000_000
                    elif 'Billion' in jackpot_text:
                        jackpot_text = jackpot_text.replace('Billion', '').strip()
                        jackpot_amount = float(jackpot_text) * 1_000_000_000
                    else:
                        jackpot_amount = float(jackpot_text)
                except ValueError:
                    pass
            
            if len(white_balls) == 5 and powerball > 0:
                return {
                    'draw_number': 0,
                    'draw_date': draw_date,
                    'white_balls': white_balls,
                    'powerball': powerball,
                    'jackpot_amount': jackpot_amount,
                    'winners': 0,
                    'source': 'powerball.com'
                }
            
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
            soup = BeautifulSoup(html, 'html.parser')
            
            draw_elem = soup.select_one('.draw-result')
            if not draw_elem:
                logger.warning("No draw results found on Powerball.com history page")
                return None
            
            date_elem = draw_elem.select_one('.draw-date')
            draw_date = datetime.now().strftime("%Y-%m-DD")
            if date_elem:
                date_str = date_elem.text.strip()
                try:
                    date_obj = datetime.strptime(date_str, "%B %d, %Y")
                    draw_date = date_obj.strftime("%Y-%m-DD")
                except ValueError:
                    pass
            
            number_elems = draw_elem.select('.number')
            white_balls = []
            powerball = 0
            if len(number_elems) >= 6:
                try:
                    white_balls = [int(num.text.strip()) for num in number_elems[:5]]
                    powerball = int(number_elems[5].text.strip())
                except ValueError:
                    logger.warning("Could not parse numbers from Powerball.com history")
                    return None
            
            jackpot_amount = 0
            jackpot_elem = draw_elem.select_one('.jackpot-amount')
            if jackpot_elem:
                jackpot_text = jackpot_elem.text.strip().replace('$', '').replace(',', '')
                try:
                    if 'Million' in jackpot_text:
                        jackpot_text = jackpot_text.replace('Million', '').strip()
                        jackpot_amount = float(jackpot_text) * 1_000_000
                    elif 'Billion' in jackpot_text:
                        jackpot_text = jackpot_text.replace('Billion', '').strip()
                        jackpot_amount = float(jackpot_text) * 1_000_000_000
                    else:
                        jackpot_amount = float(jackpot_text)
                except ValueError:
                    pass
            
            winners = 0
            winner_elem = draw_elem.select_one('.winner-info')
            if winner_elem and 'winner' in winner_elem.text.lower():
                winners = 1
            
            if len(white_balls) == 5 and powerball > 0:
                return {
                    'draw_number': 0,
                    'draw_date': draw_date,
                    'white_balls': white_balls,
                    'powerball': powerball,
                    'jackpot_amount': jackpot_amount,
                    'winners': winners,
                    'source': 'powerball.com'
                }
            
            return None
    
    def _generate_mock_draw(self) -> Dict[str, Any]:
        """Generate a mock draw for testing or when all fetch methods fail"""
        today = datetime.now()
        draw_date = today.strftime("%Y-%m-DD")
        
        draw_number = (self.latest_draw_number + 1) if self.latest_draw_number > 0 else random.randint(1000, 2000)
        
        white_balls = sorted(random.sample(range(1, 70), 5))
        powerball = random.randint(1, 26)
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
        today = datetime.now()
        start_draw_number = self.latest_draw_number if self.latest_draw_number > 0 else 2000
        
        for i in range(count):
            days_back = i * random.randint(3, 4)
            draw_date = (today - timedelta(days=days_back)).strftime("%Y-%m-DD")
            draw_number = start_draw_number - i
            white_balls = sorted(random.sample(range(1, 70), 5))
            powerball = random.randint(1, 26)
            base_amount = random.randint(20, 50) * 1_000_000
            growth_factor = 1 + (i * 0.05)
            jackpot_amount = int(base_amount * growth_factor)
            winners = random.choices([0, 1, 2], weights=[0.9, 0.09, 0.01])[0]
            if winners > 0:
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
        """
        if draw.get('jackpot_amount', 0) > 0 and draw.get('source') != 'mock_data':
            return draw
            
        try:
            pb_draw = await self._fetch_from_powerball_main()
            
            if pb_draw and sorted(draw['white_balls']) == sorted(pb_draw['white_balls']) and draw['powerball'] == pb_draw['powerball']:
                if pb_draw.get('jackpot_amount', 0) > 0 and draw.get('jackpot_amount', 0) == 0:
                    draw['jackpot_amount'] = pb_draw['jackpot_amount']
                if pb_draw.get('winners', 0) > 0 and draw.get('winners', 0) == 0:
                    draw['winners'] = pb_draw['winners']
                draw['source'] = f"{draw['source']}_enhanced"
        except Exception as e:
            logger.error(f"Error enhancing draw with details: {str(e)}")
        
        return draw

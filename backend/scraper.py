# backend/scraper.py
import asyncio
import httpx
import logging
import random
import re
import json
from typing import List, Dict, Any, Optional
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
        """
        logger.info("Fetching latest Powerball draw...")
        
        # Try CA API first
        try:
            draw = await self._fetch_from_ca_api()
            if draw:
                self.latest_draw_number = max(self.latest_draw_number, draw.get('draw_number', 0))
                return draw
        except Exception as e:
            logger.error(f"Error fetching from CalLottery API: {e}")
        
        # Try CA website
        try:
            draw = await self._fetch_from_ca_web()
            if draw:
                self.latest_draw_number = max(self.latest_draw_number, draw.get('draw_number', 0))
                return draw
        except Exception as e:
            logger.error(f"Error fetching from CalLottery web: {e}")
        
        # Try Powerball main page
        try:
            draw = await self._fetch_from_powerball_main()
            if draw:
                if self.latest_draw_number > 0:
                    draw['draw_number'] = self.latest_draw_number + 1
                self.latest_draw_number = max(self.latest_draw_number, draw.get('draw_number', 0))
                return draw
        except Exception as e:
            logger.error(f"Error fetching from Powerball.com main: {e}")
        
        # Try Powerball history page
        try:
            draw = await self._fetch_from_powerball_history()
            if draw:
                if self.latest_draw_number > 0:
                    draw['draw_number'] = self.latest_draw_number + 1
                self.latest_draw_number = max(self.latest_draw_number, draw.get('draw_number', 0))
                return draw
        except Exception as e:
            logger.error(f"Error fetching from Powerball.com history: {e}")
        
        # Fallback to mock
        logger.warning("All fetch methods failed, generating mock draw")
        mock_draw = self._generate_mock_draw()
        if self.latest_draw_number > 0:
            mock_draw['draw_number'] = self.latest_draw_number + 1
        self.latest_draw_number = max(self.latest_draw_number, mock_draw['draw_number'])
        return mock_draw
    
    async def fetch_historical_draws(self, count: int = 20) -> List[Dict[str, Any]]:
        """
        Fetch historical Powerball draws, starting with CalLottery then fallback to Powerball.com
        """
        logger.info(f"Fetching {count} historical Powerball draws...")
        all_draws: List[Dict[str, Any]] = []
        
        # First, try CA API historical
        try:
            ca_draws = await self._fetch_historical_from_ca_api(max_count=count)
            all_draws.extend(ca_draws)
            self.latest_draw_number = max(self.latest_draw_number, *(d.get('draw_number', 0) for d in ca_draws))
            logger.info(f"Fetched {len(ca_draws)} draws from CalLottery API")
        except Exception as e:
            logger.error(f"Error fetching from CA API: {e}")
        
        # If not enough, try Powerball history page
        remaining = count - len(all_draws)
        if remaining > 0:
            try:
                pb_draws = await self._fetch_historical_from_powerball(remaining)
                # Assign draw_numbers descending from latest
                for i, draw in enumerate(pb_draws):
                    draw['draw_number'] = self.latest_draw_number - i - 1
                all_draws.extend(pb_draws)
                logger.info(f"Fetched {len(pb_draws)} draws from Powerball.com history")
            except Exception as e:
                logger.error(f"Error fetching from Powerball history: {e}")
        
        # Fill with mock if still short
        if len(all_draws) < count:
            needed = count - len(all_draws)
            logger.warning(f"Only fetched {len(all_draws)} draws, generating {needed} mock draws")
            mock = self._generate_mock_historical_draws(needed)
            all_draws.extend(mock)
        
        return all_draws[:count]
    
    @retry(stop=stop_after_attempt(3), wait=wait_fixed(2),
           retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)))
    async def _fetch_from_ca_api(self) -> Optional[Dict[str, Any]]:
        headers = {
            'User-Agent': self.user_agent.random,
            'Accept': 'application/json',
            'Referer': self.ca_web_url
        }
        logger.info(f"Requesting CA API: {self.ca_api_url}")
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(self.ca_api_url, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            if not data.get('PreviousDraws'):
                return None
            return self._parse_ca_api_draw(data['PreviousDraws'][0])
    
    def _parse_ca_api_draw(self, d: Dict[str, Any]) -> Dict[str, Any]:
        try:
            num = int(d.get('DrawNumber', d.get('drawNumber', 0)))
            date = d.get('DrawDate', '')
            if 'T' in date:
                date = date.split('T')[0]
            elif '/' in date:
                m, day, y = date.split('/')
                date = f"{y}-{m.zfill(2)}-{day.zfill(2)}"
            else:
                raise ValueError("Unknown date format")
            
            wn = d.get('WinningNumbers', {})
            whites = [int(wn[str(i)]['Number']) for i in range(5)]
            pb   = int(wn['5']['Number']) if wn['5'].get('IsSpecial') else 0
            
            # jackpot / winners
            prizes = d.get('Prizes', {})
            jackpot = float(prizes.get('1', {}).get('Amount', 0))
            winners = int(prizes.get('1', {}).get('Count', 0))
            
            return {
                'draw_number': num,
                'draw_date': date,
                'white_balls': whites,
                'powerball': pb,
                'jackpot_amount': jackpot,
                'winners': winners,
                'source': 'ca_api'
            }
        except Exception as e:
            logger.error(f"Error parsing CA API draw: {e}")
            return {
                'draw_number': d.get('DrawNumber', 0),
                'draw_date': d.get('DrawDate', '').split('T')[0],
                'white_balls': [0]*5,
                'powerball': 0,
                'jackpot_amount': 0,
                'winners': 0,
                'source': 'ca_api',
                'parse_error': str(e)
            }
    
    @retry(stop=stop_after_attempt(3), wait=wait_fixed(2),
           retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)))
    async def _fetch_from_ca_web(self) -> Optional[Dict[str, Any]]:
        headers = {
            'User-Agent': self.user_agent.random,
            'Accept': 'text/html',
        }
        logger.info(f"Requesting CA web: {self.ca_web_url}")
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(self.ca_web_url, headers=headers)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, 'html.parser')
            card = soup.select_one('.draw-cards .draw-card')
            if not card:
                return None
            
            date_elem = card.select_one('.draw-card--header time')
            date_txt = date_elem.text.strip() if date_elem else ''
            try:
                date = datetime.strptime(date_txt, "%A, %B %d, %Y").strftime("%Y-%m-%d")
            except:
                date = date_txt  # leave as-is
            
            num_txt = card.select_one('.draw-card--header .draw-card--draw-number').text or ''
            num_match = re.search(r'(\d+)', num_txt)
            num = int(num_match.group(1)) if num_match else 0
            
            nums = [int(x.text) for x in card.select('.winning-number')]
            whites = nums[:5]
            pb     = nums[5] if len(nums) > 5 else 0
            
            # jackpot
            jp_txt = card.select_one('.draw-card--prize-amount').text or '$0'
            jp = 0
            try:
                jp_clean = jp_txt.replace('$','').replace(',','')
                if 'Million' in jp_clean:
                    jp = float(jp_clean.replace('Million','')) * 1_000_000
                elif 'Billion' in jp_clean:
                    jp = float(jp_clean.replace('Billion','')) * 1_000_000_000
                else:
                    jp = float(jp_clean)
            except:
                jp = 0
            
            # winners
            win_elem = card.select_one('.has-winners')
            win = 0
            if win_elem:
                m = re.search(r'(\d+)', win_elem.text)
                win = int(m.group(1)) if m else 1
            
            return {
                'draw_number': num,
                'draw_date': date,
                'white_balls': whites,
                'powerball': pb,
                'jackpot_amount': jp,
                'winners': win,
                'source': 'ca_web'
            }
    
    @retry(stop=stop_after_attempt(3), wait=wait_fixed(2),
           retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)))
    async def _fetch_historical_from_ca_api(self, max_count: int) -> List[Dict[str, Any]]:
        headers = {
            'User-Agent': self.user_agent.random,
            'Accept': 'application/json',
        }
        draws: List[Dict[str,Any]] = []
        page = 1
        per_page = 20
        max_pages = (max_count + per_page - 1) // per_page
        
        async with httpx.AsyncClient(timeout=15) as client:
            while page <= max_pages and len(draws) < max_count:
                url = f"https://www.calottery.com/api/DrawGameApi/DrawGamePastDrawResults/12/{page}/{per_page}"
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                data = resp.json().get('PreviousDraws', [])
                if not data:
                    break
                for item in data:
                    parsed = self._parse_ca_api_draw(item)
                    if parsed:
                        draws.append(parsed)
                page += 1
                await asyncio.sleep(random.uniform(1, 2))
        
        return draws[:max_count]
    
    @retry(stop=stop_after_attempt(3), wait=wait_fixed(2),
           retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)))
    async def _fetch_historical_from_powerball(self, count: int) -> List[Dict[str, Any]]:
        headers = {
            'User-Agent': self.user_agent.random,
            'Accept': 'text/html',
        }
        logger.info(f"Requesting Powerball history: {self.powerball_history_url}")
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(self.powerball_history_url, headers=headers)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, 'html.parser')
            elems = soup.select('.draw-result')[:count]
            results: List[Dict[str,Any]] = []
            for el in elems:
                try:
                    date_str = el.select_one('.draw-date').text.strip()
                    try:
                        date = datetime.strptime(date_str, "%B %d, %Y").strftime("%Y-%m-%d")
                    except:
                        date = datetime.now().strftime("%Y-%m-%d")
                    nums = [int(x.text) for x in el.select('.number')][:6]
                    whites, pb = nums[:5], nums[5]
                    jp_elem = el.select_one('.jackpot-amount')
                    jp = 0
                    if jp_elem:
                        txt = jp_elem.text.replace('$','').replace(',','')
                        if 'Million' in txt:
                            jp = float(txt.replace('Million','')) * 1_000_000
                        elif 'Billion' in txt:
                            jp = float(txt.replace('Billion','')) * 1_000_000_000
                        else:
                            jp = float(txt)
                    win = 1 if 'winner' in (el.select_one('.winner-info') or BeautifulSoup('', 'html.parser')).text.lower() else 0
                    results.append({
                        'draw_number': 0,
                        'draw_date': date,
                        'white_balls': whites,
                        'powerball': pb,
                        'jackpot_amount': jp,
                        'winners': win,
                        'source': 'powerball.com'
                    })
                except Exception as e:
                    logger.warning(f"Error parsing Powerball.com entry: {e}")
            return results
    
    @retry(stop=stop_after_attempt(3), wait=wait_fixed(2),
           retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)))
    async def _fetch_from_powerball_main(self) -> Optional[Dict[str, Any]]:
        headers = {
            'User-Agent': self.user_agent.random,
            'Accept': 'text/html',
        }
        logger.info(f"Requesting Powerball main: {self.powerball_url}")
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(self.powerball_url, headers=headers)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, 'html.parser')
            date_elem = soup.select_one('.draw-date')
            if date_elem:
                try:
                    date = datetime.strptime(date_elem.text.strip(), "%B %d, %Y").strftime("%Y-%m-%d")
                except:
                    date = datetime.now().strftime("%Y-%m-%d")
            else:
                date = datetime.now().strftime("%Y-%m-%d")
            nums = [int(x.text) for x in soup.select('.number')][:6]
            whites, pb = nums[:5], nums[5]
            jp = 0
            jp_elem = soup.select_one('.jackpot-amount')
            if jp_elem:
                txt = jp_elem.text.replace('$','').replace(',','')
                if 'Million' in txt:
                    jp = float(txt.replace('Million','')) * 1_000_000
                elif 'Billion' in txt:
                    jp = float(txt.replace('Billion','')) * 1_000_000_000
                else:
                    jp = float(txt)
            return {
                'draw_number': 0,
                'draw_date': date,
                'white_balls': whites,
                'powerball': pb,
                'jackpot_amount': jp,
                'winners': 0,
                'source': 'powerball.com'
            }
    
    @retry(stop=stop_after_attempt(3), wait=wait_fixed(2),
           retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)))
    async def _fetch_from_powerball_history(self) -> Optional[Dict[str, Any]]:
        headers = {
            'User-Agent': self.user_agent.random,
            'Accept': 'text/html',
        }
        logger.info(f"Requesting Powerball history page: {self.powerball_history_url}")
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(self.powerball_history_url, headers=headers)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, 'html.parser')
            el = soup.select_one('.draw-result')
            if not el:
                return None
            try:
                date_str = el.select_one('.draw-date').text.strip()
                date = datetime.strptime(date_str, "%B %d, %Y").strftime("%Y-%m-%d")
            except:
                date = datetime.now().strftime("%Y-%m-%d")
            nums = [int(x.text) for x in el.select('.number')][:6]
            whites, pb = nums[:5], nums[5]
            jp = 0
            jp_elem = el.select_one('.jackpot-amount')
            if jp_elem:
                txt = jp_elem.text.replace('$','').replace(',','')
                if 'Million' in txt:
                    jp = float(txt.replace('Million','')) * 1_000_000
                elif 'Billion' in txt:
                    jp = float(txt.replace('Billion','')) * 1_000_000_000
                else:
                    jp = float(txt)
            win = 1 if 'winner' in (el.select_one('.winner-info') or BeautifulSoup('', 'html.parser')).text.lower() else 0
            return {
                'draw_number': 0,
                'draw_date': date,
                'white_balls': whites,
                'powerball': pb,
                'jackpot_amount': jp,
                'winners': win,
                'source': 'powerball.com'
            }
    
    def _generate_mock_draw(self) -> Dict[str, Any]:
        """Generate a mock draw when live fetch fails"""
        today = datetime.now()
        date = today.strftime("%Y-%m-%d")  # fixed format
        num = (self.latest_draw_number + 1) if self.latest_draw_number > 0 else random.randint(1000, 2000)
        whites = sorted(random.sample(range(1,70),5))
        pb = random.randint(1,26)
        jp = random.randint(50,500) * 1_000_000
        return {
            'draw_number': num,
            'draw_date': date,
            'white_balls': whites,
            'powerball': pb,
            'jackpot_amount': jp,
            'winners': 0,
            'source': 'mock_data'
        }
    
    def _generate_mock_historical_draws(self, count: int) -> List[Dict[str, Any]]:
        """Generate mock historical draws if not enough real ones"""
        draws: List[Dict[str, Any]] = []
        today = datetime.now()
        base_num = self.latest_draw_number or 2000
        for i in range(count):
            d = today - timedelta(days=(i * random.randint(3,4)))
            date = d.strftime("%Y-%m-%d")  # fixed format
            num = base_num - i
            whites = sorted(random.sample(range(1,70),5))
            pb = random.randint(1,26)
            base_amt = random.randint(20,50)*1_000_000
            jp = int(base_amt * (1 + i*0.05))
            wins = random.choices([0,1,2], weights=[0.9,0.09,0.01])[0]
            if wins>0:
                jp = random.randint(20,40)*1_000_000
            draws.append({
                'draw_number': num,
                'draw_date': date,
                'white_balls': whites,
                'powerball': pb,
                'jackpot_amount': jp,
                'winners': wins,
                'source': 'mock_data'
            })
        return draws

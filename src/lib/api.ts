// src/lib/api.ts
// API client for Powerball Analyzer with enhanced logging and error handling

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const LOG_LEVEL = 'info'; // 'debug', 'info', 'warn', 'error'

// Logger for frontend API interactions
const logger = {
  debug: (message: string, data?: any) => {
    if (['debug'].includes(LOG_LEVEL)) console.debug(`[API] ${message}`, data || '');
  },
  info: (message: string, data?: any) => {
    if (['debug', 'info'].includes(LOG_LEVEL)) console.info(`[API] ${message}`, data || '');
  },
  warn: (message: string, data?: any) => {
    if (['debug', 'info', 'warn'].includes(LOG_LEVEL)) console.warn(`[API] ${message}`, data || '');
  },
  error: (message: string, data?: any) => {
    if (['debug', 'info', 'warn', 'error'].includes(LOG_LEVEL)) console.error(`[API] ${message}`, data || '');
  },
};

// Helper to get auth token
const getAuthToken = (): string | null => localStorage.getItem('token');

// Helper to get headers with auth token if available
const getHeaders = (includeAuth: boolean = true): HeadersInit => {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (includeAuth) {
    const token = getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

// Generic fetch with logging and enhanced error handling
const fetchWithLogging = async (
  url: string,
  options: RequestInit,
  skipAuthRedirect: boolean = false
): Promise<any> => {
  const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`;
  logger.info(`Request: ${options.method} ${fullUrl}`, {
    headers: options.headers,
    body: options.body,
  });

  try {
    const response = await fetch(fullUrl, options);
    let clonedResponse;
    try {
      clonedResponse = response.clone();
    } catch (e) {
      logger.warn('Could not clone response for logging', e);
    }

    if (response.status === 401 && !skipAuthRedirect) {
      logger.warn('Authentication required - redirecting to login');
      localStorage.removeItem('token');
      localStorage.removeItem('user_id');
      localStorage.removeItem('username');
      window.location.href = '/login';
      throw new Error('Authentication required');
    }

    if (!response.ok) {
      const errorData = await response.text();
      logger.error(`Response error: ${response.status} ${response.statusText}`, errorData);
      throw new Error(errorData || `Request failed with status ${response.status}`);
    }

    if (clonedResponse) {
      try {
        const responseData = await clonedResponse.json();
        logger.info(`Response: ${response.status}`, responseData);
      } catch (e) {
        const responseText = await clonedResponse.text();
        logger.info(
          `Response: ${response.status}`,
          responseText.length > 500 ? responseText.substring(0, 500) + '... [truncated]' : responseText
        );
      }
    } else {
      logger.info(`Response: ${response.status}`, 'Body already consumed');
    }

    return response.json();
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') throw error;
    logger.error('Fetch error', error);
    throw error;
  }
};

/**
 * Validate draw parameters in real-time
 */
export function validateDrawParameters(
  drawNumber: number | string,
  drawDate: string,
  whiteBalls: (number | string)[],
  powerball: number | string
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  const numDrawNumber = typeof drawNumber === 'string' ? parseInt(drawNumber, 10) : drawNumber;
  const numWhiteBalls = whiteBalls.map(ball => (typeof ball === 'string' ? parseInt(ball, 10) : ball));
  const numPowerball = typeof powerball === 'string' ? parseInt(powerball, 10) : powerball;

  if (isNaN(numDrawNumber) || numDrawNumber <= 0) {
    errors.push('Draw number must be a positive number');
  }

  if (!drawDate) {
    errors.push('Draw date is required');
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(drawDate)) {
    errors.push('Draw date must be in YYYY-MM-DD format');
  }

  if (numWhiteBalls.length !== 5) {
    errors.push('Exactly 5 white balls are required');
  } else {
    for (let i = 0; i < numWhiteBalls.length; i++) {
      if (isNaN(numWhiteBalls[i]) || numWhiteBalls[i] < 1 || numWhiteBalls[i] > 69) {
        errors.push(`White ball #${i + 1} must be between 1 and 69`);
      }
    }
    if (new Set(numWhiteBalls).size !== 5) {
      errors.push('White balls must be unique');
    }
  }

  if (isNaN(numPowerball) || numPowerball < 1 || numPowerball > 26) {
    errors.push('Powerball must be between 1 and 26');
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Add a new Powerball draw
 */
export async function addDraw(
  drawNumber: number,
  drawDate: string,
  whiteBalls: number[],
  powerball: number,
  jackpotAmount: number = 0,
  winners: number = 0
) {
  logger.info('Adding new draw', { drawNumber, drawDate, whiteBalls, powerball });
  const sortedWhiteBalls = [...whiteBalls].sort((a, b) => a - b);
  let formattedDate = drawDate;

  if (!drawDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const dateParts = drawDate.split('/');
    if (dateParts.length === 3) {
      const month = dateParts[0].padStart(2, '0');
      const day = dateParts[1].padStart(2, '0');
      const year = dateParts[2].length === 2 ? `20${dateParts[2]}` : dateParts[2];
      formattedDate = `${year}-${month}-${day}`;
    }
  }

  const validation = validateDrawParameters(drawNumber, formattedDate, sortedWhiteBalls, powerball);
  if (!validation.isValid) {
    logger.error('Validation failed for addDraw', validation.errors);
    throw new Error(validation.errors.join('; '));
  }

  try {
    const response = await fetchWithLogging('/api/draws/add', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        draw_number: drawNumber,
        draw_date: formattedDate,
        white_balls: sortedWhiteBalls,
        powerball,
        jackpot_amount: jackpotAmount,
        winners,
      }),
    });
    logger.info(`Successfully added draw ${drawNumber}`, response);
    return response;
  } catch (error) {
    logger.error('Error adding draw:', error);
    throw error;
  }
}

/**
 * Check numbers against a draw
 */
export async function checkNumbers(userId: string, drawNumber: number, numbers: number[]) {
  logger.info('Checking numbers', { userId, drawNumber, numbers });
  return fetchWithLogging('/api/check_numbers', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      user_id: userId,
      draw_number: drawNumber,
      numbers,
    }),
  });
}

/**
 * Scrape the latest Powerball draw
 */
export async function scrapePowerball() {
  logger.info('Scraping latest Powerball data');
  return fetchWithLogging('/api/scrape/latest', {
    method: 'POST',
    headers: getHeaders(),
  });
}

/**
 * Scrape historical Powerball draws
 */
export async function scrapeHistoricalDraws(count: number = 20) {
  logger.info('Scraping historical Powerball data', { count });
  return fetchWithLogging(`/api/scrape/historical?count=${count}`, {
    method: 'POST',
    headers: getHeaders(),
  });
}

/**
 * Generate a prediction
 */
export async function generatePrediction(method: string = 'frequency', userId: string = 'anonymous') {
  logger.info('Generating prediction', { method, userId });
  return fetchWithLogging('/api/predictions', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      method,
      user_id: userId,
    }),
  });
}

/**
 * Get frequency analysis
 */
export async function getFrequencyAnalysis() {
  logger.info('Getting frequency analysis');
  return fetchWithLogging('/api/insights/frequency', {
    method: 'GET',
    headers: getHeaders(false),
  });
}

/**
 * Get hot numbers
 */
export async function getHotNumbers() {
  logger.info('Getting hot numbers');
  return fetchWithLogging('/api/insights/hot', {
    method: 'GET',
    headers: getHeaders(false),
  });
}

/**
 * Get due numbers
 */
export async function getDueNumbers() {
  logger.info('Getting due numbers');
  return fetchWithLogging('/api/insights/due', {
    method: 'GET',
    headers: getHeaders(false),
  });
}

/**
 * Get pair analysis
 */
export async function getPairs() {
  logger.info('Getting pair analysis');
  return fetchWithLogging('/api/insights/pairs', {
    method: 'GET',
    headers: getHeaders(false),
  });
}

/**
 * Get position analysis
 */
export async function getPositions() {
  logger.info('Getting position analysis');
  return fetchWithLogging('/api/insights/positions', {
    method: 'GET',
    headers: getHeaders(false),
  });
}

/**
 * Get cluster analysis
 */
export async function getClusters() {
  logger.info('Getting cluster analysis');
  return fetchWithLogging('/api/insights/cluster', {
    method: 'GET',
    headers: getHeaders(false),
  });
}

/**
 * Get number gap analysis
 */
export async function getNumberAnalysis(number: number) {
  logger.info('Getting number gap analysis', { number });
  return fetchWithLogging('/api/insights/number', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ number }),
  });
}

/**
 * Save custom combination
 */
export async function saveCombination(whiteBalls: number[], powerball: number, score: number = 0.5, method: string = 'user_custom', reason: string = 'User-defined combination') {
  logger.info('Saving custom combination', { whiteBalls, powerball, method });
  return fetchWithLogging('/api/combinations/update', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      white_balls: whiteBalls,
      powerball,
      score,
      method,
      reason,
    }),
  });
}

/**
 * Save user settings
 */
export async function saveUserSettings(settings: any) {
  logger.info('Saving user settings');
  return fetchWithLogging('/api/user_settings', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(settings),
  });
}

/**
 * Get all draws
 */
export async function getDraws(limit: number = 1000, offset: number = 0) {
  logger.info('Getting all draws', { limit, offset });
  return fetchWithLogging(`/api/draws?limit=${limit}&offset=${offset}`, {
    method: 'GET',
    headers: getHeaders(false),
  });
}

/**
 * Get latest draw
 */
export async function getLatestDraw() {
  logger.info('Getting latest draw');
  return fetchWithLogging('/api/draws/latest', {
    method: 'GET',
    headers: getHeaders(false),
  });
}

/**
 * Get draw by number
 */
export async function getDrawByNumber(drawNumber: number) {
  logger.info('Getting draw by number', { drawNumber });
  return fetchWithLogging(`/api/draws/${drawNumber}`, {
    method: 'GET',
    headers: getHeaders(false),
  });
}

/**
 * Update draw winner status
 */
export async function updateDrawWinner(drawId: string, isWinner: boolean) {
  logger.info('Updating draw winner status', { drawId, isWinner });
  return fetchWithLogging(`/api/draws/${drawId}/winner`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ is_winner: isWinner }),
  });
}

/**
 * Get predictions
 */
export async function getPredictions(method: string = 'all', limit: number = 10, offset: number = 0) {
  logger.info('Getting predictions', { method, limit, offset });
  return fetchWithLogging(`/api/predictions?method=${method}&limit=${limit}&offset=${offset}`, {
    method: 'GET',
    headers: getHeaders(false),
  });
}

/**
 * Get user stats
 */
export async function getUserStats(userId: string = 'anonymous') {
  logger.info('Getting user stats', { userId });
  return fetchWithLogging(`/api/user_stats?user_id=${userId}`, {
    method: 'GET',
    headers: getHeaders(),
  });
}

/**
 * Get user checks
 */
export async function getUserChecks(userId: string = 'anonymous', limit: number = 10, offset: number = 0) {
  logger.info('Getting user checks', { userId, limit, offset });
  return fetchWithLogging(`/api/user_checks?user_id=${userId}&limit=${limit}&offset=${offset}`, {
    method: 'GET',
    headers: getHeaders(),
  });
}

/**
 * Reset database schema
 */
export async function resetDatabaseSchema() {
  logger.info('Resetting database schema');
  return fetchWithLogging('/api/db/reset', {
    method: 'POST',
    headers: getHeaders(),
  });
}

/**
 * Get health status
 */
export async function getHealthStatus() {
  logger.info('Checking API health');
  return fetchWithLogging('/api/health', {
    method: 'GET',
    headers: getHeaders(false),
  });
}

/**
 * Get ideas (placeholder for feature suggestions)
 */
export async function getIdeas() {
  logger.info('Getting ideas');
  return fetchWithLogging('/api/ideas', {
    method: 'GET',
    headers: getHeaders(false),
  });
}

/**
 * User login
 */
export async function login(username: string, password: string) {
  logger.info('User login attempt', { username });
  const formData = new URLSearchParams();
  formData.append('username', username);
  formData.append('password', password);

  try {
    const response = await fetch(`${API_URL}/api/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.text();
      logger.error('Login failed', errorData);
      throw new Error(`Login failed: ${errorData}`);
    }

    const data = await response.json();
    logger.info('Login successful', { username, userId: data.user_id });
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('user_id', data.user_id.toString());
    localStorage.setItem('username', data.username);
    return data;
  } catch (error) {
    logger.error('Login error', error);
    throw error;
  }
}

/**
 * User registration
 */
export async function register(username: string, password: string, email?: string) {
  logger.info('User registration attempt', { username, email });
  try {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      logger.error('Registration failed', errorData);
      throw new Error(`Registration failed: ${errorData}`);
    }

    const data = await response.json();
    logger.info('Registration successful', { username, userId: data.id });
    return data;
  } catch (error) {
    logger.error('Registration error', error);
    throw error;
  }
}

/**
 * User logout
 */
export function logout() {
  const username = localStorage.getItem('username');
  logger.info('User logout', { username });
  localStorage.removeItem('token');
  localStorage.removeItem('user_id');
  localStorage.removeItem('username');
  window.location.href = '/login';
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  const hasToken = !!getAuthToken();
  logger.debug('Authentication check', { isAuthenticated: hasToken });
  return hasToken;
}

/**
 * Get current user info
 */
export function getCurrentUser() {
  const userId = localStorage.getItem('user_id');
  const username = localStorage.getItem('username');
  if (!userId || !username) {
    logger.debug('Get current user: No user logged in');
    return null;
  }
  logger.debug('Get current user', { userId, username });
  return { id: parseInt(userId), username };
}

/**
 * Get current user info from server
 */
export async function getCurrentUserServer() {
  logger.info('Getting current user from server');
  return fetchWithLogging('/api/auth/me', {
    method: 'GET',
    headers: getHeaders(),
  });
}

/**
 * Get all insights summary
 */
export async function getAllInsights() {
  logger.info('Getting all insights');
  return fetchWithLogging('/api/insights/all', {
    method: 'GET',
    headers: getHeaders(false),
  });
}

/**
 * Run analytics tasks
 */
export async function runAnalytics() {
  logger.info('Running analytics tasks');
  return fetchWithLogging('/api/analytics/run', {
    method: 'POST',
    headers: getHeaders(),
  });
}

/**
 * Get top combinations
 */
export async function getTopCombinations(limit: number = 10) {
  logger.info('Getting top combinations', { limit });
  return fetchWithLogging(`/api/combinations?limit=${limit}`, {
    method: 'GET',
    headers: getHeaders(false),
  });
}
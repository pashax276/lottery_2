// src/lib/api.ts
// API client for Powerball Analyzer with comprehensive debug logging

// Debug helper
const DEBUG = true;
const debugLog = (context: string, message: string, data?: any) => {
  if (DEBUG) {
    console.log(`[API:${context}] ${message}`, data || '');
  }
};

// Use relative URL for API calls - nginx will proxy to backend
const API_URL = import.meta.env.VITE_API_URL || '';
debugLog('Init', 'API_URL:', API_URL);
debugLog('Init', 'Environment variables:', import.meta.env);

// Helper to get auth token
const getAuthToken = (): string | null => {
  const token = localStorage.getItem('token');
  debugLog('Auth', 'Retrieved token:', token ? 'Token exists' : 'No token');
  
  // Only return the token if it's a non-empty string
  return token && token.trim() !== '' ? token : null;
};

// Helper to get headers with auth token if available
const getHeaders = (includeAuth: boolean = true): HeadersInit => {
  debugLog('Headers', `Creating headers (includeAuth: ${includeAuth})`);
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  
  if (includeAuth) {
    const token = getAuthToken();
    if (token) {
      // This is the critical line - the format must be exactly "Bearer " with a space
      headers['Authorization'] = `Bearer ${token}`;
      debugLog('Headers', 'Added auth token to headers');
    }
  }
  
  debugLog('Headers', 'Final headers:', headers);
  return headers;
};

// Generic fetch with comprehensive logging
const fetchWithLogging = async (
  endpoint: string,
  options: RequestInit,
  skipAuthRedirect: boolean = false
): Promise<any> => {
  const url = `${API_URL}${endpoint}`;
  const fullUrl = window.location.origin + url;
  
  debugLog('Fetch', 'Starting request', {
    endpoint,
    url,
    fullUrl,
    method: options.method,
    headers: options.headers,
    body: options.body
  });

  try {
    debugLog('Fetch', 'Calling fetch()...');
    const response = await fetch(url, options);
    
    debugLog('Fetch', 'Response received', {
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      type: response.type,
      headers: Object.fromEntries(response.headers.entries())
    });

    if (response.status === 401 && !skipAuthRedirect) {
      debugLog('Fetch', 'Authentication required - redirecting to login');
      localStorage.removeItem('token');
      localStorage.removeItem('user_id');
      localStorage.removeItem('username');
      window.location.href = '/login';
      throw new Error('Authentication required');
    }

    if (!response.ok) {
      debugLog('Fetch', 'Response not OK, reading error text...');
      const errorData = await response.text();
      debugLog('Fetch', 'Error response:', errorData);
      throw new Error(errorData || `Request failed with status ${response.status}`);
    }

    debugLog('Fetch', 'Parsing JSON response...');
    const data = await response.json();
    debugLog('Fetch', 'Response data:', data);
    return data;
  } catch (error) {
    debugLog('Fetch', 'Error caught', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    if (error instanceof Error && error.message === 'Authentication required') {
      throw error;
    }
    
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      debugLog('Fetch', 'Network error - possible causes:', {
        'CORS': 'Check if backend allows requests from frontend origin',
        'Backend down': 'Check if backend is running',
        'Proxy': 'Check nginx proxy configuration',
        'URL': `Tried to fetch: ${url}`
      });
    }
    
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
  debugLog('addDraw', 'Starting addDraw', { drawNumber, drawDate, whiteBalls, powerball });
  
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
    debugLog('addDraw', 'Validation failed', validation.errors);
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
    debugLog('addDraw', 'Success', response);
    return response;
  } catch (error) {
    debugLog('addDraw', 'Error', error);
    throw error;
  }
}

/**
 * Check numbers against a draw
 */
export async function checkNumbers(userId: string, drawNumber: number, numbers: number[]) {
  debugLog('checkNumbers', 'Starting checkNumbers', { userId, drawNumber, numbers });
  try {
    const result = await fetchWithLogging('/api/check_numbers', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        user_id: userId,
        draw_number: drawNumber,
        numbers,
      }),
    });
    debugLog('checkNumbers', 'Success', result);
    return result;
  } catch (error) {
    debugLog('checkNumbers', 'Error', error);
    throw error;
  }
}

/**
 * Scrape the latest Powerball draw
 */
export async function scrapePowerball() {
  debugLog('scrapePowerball', 'Starting scrapePowerball');
  try {
    const result = await fetchWithLogging('/api/scrape/latest', {
      method: 'POST',
      headers: getHeaders(),
    });
    debugLog('scrapePowerball', 'Success', result);
    return result;
  } catch (error) {
    debugLog('scrapePowerball', 'Error', error);
    throw error;
  }
}

/**
 * Scrape historical Powerball draws
 */
export async function scrapeHistoricalDraws(count: number = 20) {
  debugLog('scrapeHistoricalDraws', 'Starting scrapeHistoricalDraws', { count });
  try {
    const result = await fetchWithLogging(`/api/scrape/historical?count=${count}`, {
      method: 'POST',
      headers: getHeaders(),
    });
    debugLog('scrapeHistoricalDraws', 'Success', result);
    return result;
  } catch (error) {
    debugLog('scrapeHistoricalDraws', 'Error', error);
    throw error;
  }
}

/**
 * Generate a prediction
 */
export async function generatePrediction(method: string = 'frequency', userId: string = 'anonymous') {
  debugLog('generatePrediction', 'Starting generatePrediction', { method, userId });
  try {
    const result = await fetchWithLogging('/api/predictions', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        method,
        user_id: userId,
      }),
    });
    debugLog('generatePrediction', 'Success', result);
    return result;
  } catch (error) {
    debugLog('generatePrediction', 'Error', error);
    throw error;
  }
}

/**
 * Get frequency analysis
 */
export async function getFrequencyAnalysis() {
  debugLog('getFrequencyAnalysis', 'Starting getFrequencyAnalysis');
  try {
    const result = await fetchWithLogging('/api/insights/frequency', {
      method: 'GET',
      headers: getHeaders(false),
    });
    debugLog('getFrequencyAnalysis', 'Success', result);
    return result;
  } catch (error) {
    debugLog('getFrequencyAnalysis', 'Error', error);
    throw error;
  }
}

/**
 * Get hot numbers
 */
export async function getHotNumbers() {
  debugLog('getHotNumbers', 'Starting getHotNumbers');
  try {
    const result = await fetchWithLogging('/api/insights/hot', {
      method: 'GET',
      headers: getHeaders(false),
    });
    debugLog('getHotNumbers', 'Success', result);
    return result;
  } catch (error) {
    debugLog('getHotNumbers', 'Error', error);
    throw error;
  }
}

/**
 * Get due numbers
 */
export async function getDueNumbers() {
  debugLog('getDueNumbers', 'Starting getDueNumbers');
  try {
    const result = await fetchWithLogging('/api/insights/due', {
      method: 'GET',
      headers: getHeaders(false),
    });
    debugLog('getDueNumbers', 'Success', result);
    return result;
  } catch (error) {
    debugLog('getDueNumbers', 'Error', error);
    throw error;
  }
}

/**
 * Get pair analysis
 */
export async function getPairs() {
  debugLog('getPairs', 'Starting getPairs');
  try {
    const result = await fetchWithLogging('/api/insights/pairs', {
      method: 'GET',
      headers: getHeaders(false),
    });
    debugLog('getPairs', 'Success', result);
    return result;
  } catch (error) {
    debugLog('getPairs', 'Error', error);
    throw error;
  }
}

/**
 * Get position analysis
 */
export async function getPositions() {
  debugLog('getPositions', 'Starting getPositions');
  try {
    const result = await fetchWithLogging('/api/insights/positions', {
      method: 'GET',
      headers: getHeaders(false),
    });
    debugLog('getPositions', 'Success', result);
    return result;
  } catch (error) {
    debugLog('getPositions', 'Error', error);
    throw error;
  }
}

/**
 * Get cluster analysis
 */
export async function getClusters() {
  debugLog('getClusters', 'Starting getClusters');
  try {
    const result = await fetchWithLogging('/api/insights/cluster', {
      method: 'GET',
      headers: getHeaders(false),
    });
    debugLog('getClusters', 'Success', result);
    return result;
  } catch (error) {
    debugLog('getClusters', 'Error', error);
    throw error;
  }
}

/**
 * Get number gap analysis
 */
export async function getNumberAnalysis(number: number) {
  debugLog('getNumberAnalysis', 'Starting getNumberAnalysis', { number });
  try {
    const result = await fetchWithLogging('/api/insights/number', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ number }),
    });
    debugLog('getNumberAnalysis', 'Success', result);
    return result;
  } catch (error) {
    debugLog('getNumberAnalysis', 'Error', error);
    throw error;
  }
}

/**
 * Save custom combination
 */
export async function saveCombination(whiteBalls: number[], powerball: number, score: number = 0.5, method: string = 'user_custom', reason: string = 'User-defined combination') {
  debugLog('saveCombination', 'Starting saveCombination', { whiteBalls, powerball, method });
  try {
    const result = await fetchWithLogging('/api/combinations/update', {
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
    debugLog('saveCombination', 'Success', result);
    return result;
  } catch (error) {
    debugLog('saveCombination', 'Error', error);
    throw error;
  }
}

/**
 * Save user settings
 */
export async function saveUserSettings(settings: any) {
  debugLog('saveUserSettings', 'Starting saveUserSettings');
  try {
    const result = await fetchWithLogging('/api/user_settings', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(settings),
    });
    debugLog('saveUserSettings', 'Success', result);
    return result;
  } catch (error) {
    debugLog('saveUserSettings', 'Error', error);
    throw error;
  }
}

/**
 * Get all draws
 */
export async function getDraws(limit: number = 1000, offset: number = 0) {
  debugLog('getDraws', 'Starting getDraws', { limit, offset });
  try {
    const result = await fetchWithLogging(`/api/draws?limit=${limit}&offset=${offset}`, {
      method: 'GET',
      headers: getHeaders(false),
    });
    debugLog('getDraws', 'Success', result);
    return result;
  } catch (error) {
    debugLog('getDraws', 'Error', error);
    throw error;
  }
}

/**
 * Get latest draw
 */
export async function getLatestDraw() {
  debugLog('getLatestDraw', 'Starting getLatestDraw');
  try {
    const result = await fetchWithLogging('/api/draws/latest', {
      method: 'GET',
      headers: getHeaders(false),
    });
    debugLog('getLatestDraw', 'Success', result);
    return result;
  } catch (error) {
    debugLog('getLatestDraw', 'Error', error);
    throw error;
  }
}

/**
 * Get draw by number
 */
export async function getDrawByNumber(drawNumber: number) {
  debugLog('getDrawByNumber', 'Starting getDrawByNumber', { drawNumber });
  try {
    const result = await fetchWithLogging(`/api/draws/${drawNumber}`, {
      method: 'GET',
      headers: getHeaders(false),
    });
    debugLog('getDrawByNumber', 'Success', result);
    return result;
  } catch (error) {
    debugLog('getDrawByNumber', 'Error', error);
    throw error;
  }
}

/**
 * Update draw winner status
 */
export async function updateDrawWinner(drawId: string, isWinner: boolean) {
  debugLog('updateDrawWinner', 'Starting updateDrawWinner', { drawId, isWinner });
  try {
    const result = await fetchWithLogging(`/api/draws/${drawId}/winner`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ is_winner: isWinner }),
    });
    debugLog('updateDrawWinner', 'Success', result);
    return result;
  } catch (error) {
    debugLog('updateDrawWinner', 'Error', error);
    throw error;
  }
}

/**
 * Get predictions
 */
export async function getPredictions(method: string = 'all', limit: number = 10, offset: number = 0) {
  debugLog('getPredictions', 'Starting getPredictions', { method, limit, offset });
  try {
    const result = await fetchWithLogging(`/api/predictions?method=${method}&limit=${limit}&offset=${offset}`, {
      method: 'GET',
      headers: getHeaders(false),
    });
    debugLog('getPredictions', 'Success', result);
    return result;
  } catch (error) {
    debugLog('getPredictions', 'Error', error);
    throw error;
  }
}

/**
 * Get user stats
 */
export async function getUserStats(userId: string = 'anonymous') {
  debugLog('getUserStats', 'Starting getUserStats', { userId });
  try {
    const result = await fetchWithLogging(`/api/user_stats?user_id=${userId}`, {
      method: 'GET',
      headers: getHeaders(),
    });
    debugLog('getUserStats', 'Success', result);
    return result;
  } catch (error) {
    debugLog('getUserStats', 'Error', error);
    throw error;
  }
}

/**
 * Get user checks
 */
export async function getUserChecks(userId: string = 'anonymous', limit: number = 10, offset: number = 0) {
  debugLog('getUserChecks', 'Starting getUserChecks', { userId, limit, offset });
  try {
    const result = await fetchWithLogging(`/api/user_checks?user_id=${userId}&limit=${limit}&offset=${offset}`, {
      method: 'GET',
      headers: getHeaders(),
    });
    debugLog('getUserChecks', 'Success', result);
    return result;
  } catch (error) {
    debugLog('getUserChecks', 'Error', error);
    throw error;
  }
}

/**
 * Reset database schema
 */
export async function resetDatabaseSchema() {
  debugLog('resetDatabaseSchema', 'Starting resetDatabaseSchema');
  try {
    const result = await fetchWithLogging('/api/db/reset', {
      method: 'POST',
      headers: getHeaders(),
    });
    debugLog('resetDatabaseSchema', 'Success', result);
    return result;
  } catch (error) {
    debugLog('resetDatabaseSchema', 'Error', error);
    throw error;
  }
}

/**
 * Get health status
 */
export async function getHealthStatus() {
  debugLog('getHealthStatus', 'Starting getHealthStatus');
  try {
    const result = await fetchWithLogging('/api/health', {
      method: 'GET',
      headers: getHeaders(false),
    });
    debugLog('getHealthStatus', 'Success', result);
    return result;
  } catch (error) {
    debugLog('getHealthStatus', 'Error', error);
    throw error;
  }
}

/**
 * Get ideas (placeholder for feature suggestions)
 */
export async function getIdeas() {
  debugLog('getIdeas', 'Starting getIdeas');
  try {
    const result = await fetchWithLogging('/api/ideas', {
      method: 'GET',
      headers: getHeaders(false),
    });
    debugLog('getIdeas', 'Success', result);
    return result;
  } catch (error) {
    debugLog('getIdeas', 'Error', error);
    throw error;
  }
}

/**
 * User login
 */
export async function login(username: string, password: string) {
  debugLog('login', 'Starting login', { username });
  const formData = new URLSearchParams();
  formData.append('username', username);
  formData.append('password', password);

  try {
    debugLog('login', 'Calling login API...');
    const response = await fetch(`${API_URL}/api/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
    });

    debugLog('login', 'Response received', {
      status: response.status,
      statusText: response.statusText
    });

    if (!response.ok) {
      const errorData = await response.text();
      debugLog('login', 'Login failed', errorData);
      throw new Error(`Login failed: ${errorData}`);
    }

    const data = await response.json();
    debugLog('login', 'Login successful', { username, userId: data.user_id });
    
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('user_id', data.user_id.toString());
    localStorage.setItem('username', data.username);
    
    return data;
  } catch (error) {
    debugLog('login', 'Error', error);
    throw error;
  }
}

/**
 * User registration
 */
export async function register(username: string, password: string, email?: string) {
  debugLog('register', 'Starting registration', { username, email });
  try {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      debugLog('register', 'Registration failed', errorData);
      throw new Error(`Registration failed: ${errorData}`);
    }

    const data = await response.json();
    debugLog('register', 'Registration successful', { username, userId: data.id });
    return data;
  } catch (error) {
    debugLog('register', 'Error', error);
    throw error;
  }
}

/**
 * User logout
 */
export function logout() {
  const username = localStorage.getItem('username');
  debugLog('logout', 'Logging out user', { username });
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
  debugLog('isAuthenticated', 'Authentication check', { isAuthenticated: hasToken });
  return hasToken;
}

/**
 * Get current user info
 */
export function getCurrentUser() {
  const userId = localStorage.getItem('user_id');
  const username = localStorage.getItem('username');
  if (!userId || !username) {
    debugLog('getCurrentUser', 'No user logged in');
    return null;
  }
  debugLog('getCurrentUser', 'Current user', { userId, username });
  return { id: parseInt(userId), username };
}

/**
 * Get current user info from server
 */
export async function getCurrentUserServer() {
  debugLog('getCurrentUserServer', 'Starting getCurrentUserServer');
  try {
    const result = await fetchWithLogging('/api/auth/me', {
      method: 'GET',
      headers: getHeaders(),
    });
    debugLog('getCurrentUserServer', 'Success', result);
    return result;
  } catch (error) {
    debugLog('getCurrentUserServer', 'Error', error);
    throw error;
  }
}

/**
 * Get all insights summary
 */
export async function getAllInsights() {
  debugLog('getAllInsights', 'Starting getAllInsights');
  try {
    const result = await fetchWithLogging('/api/insights/all', {
      method: 'GET',
      headers: getHeaders(false),
    });
    debugLog('getAllInsights', 'Success', result);
    return result;
  } catch (error) {
    debugLog('getAllInsights', 'Error', error);
    throw error;
  }
}

/**
 * Run analytics tasks
 */
export async function runAnalytics() {
  debugLog('runAnalytics', 'Starting runAnalytics');
  try {
    const result = await fetchWithLogging('/api/analytics/run', {
      method: 'POST',
      headers: getHeaders(),
    });
    debugLog('runAnalytics', 'Success', result);
    return result;
  } catch (error) {
    debugLog('runAnalytics', 'Error', error);
    throw error;
  }
}

/**
 * Get top combinations
 */
export async function getTopCombinations(limit: number = 10) {
  debugLog('getTopCombinations', 'Starting getTopCombinations', { limit });
  try {
    const result = await fetchWithLogging(`/api/combinations?limit=${limit}`, {
      method: 'GET',
      headers: getHeaders(false),
    });
    debugLog('getTopCombinations', 'Success', result);
    return result;
  } catch (error) {
    debugLog('getTopCombinations', 'Error', error);
    throw error;
  }
}

// Add a test function to help debug
export async function testApiConnection() {
  debugLog('testApiConnection', 'Starting API connection test');
  
  console.group('API Connection Test');
  
  // Test 1: Direct fetch to health endpoint
  console.log('Test 1: Direct fetch to /api/health');
  try {
    const response = await fetch('/api/health');
    console.log('Health check response:', {
      status: response.status,
      statusText: response.statusText,
      url: response.url
    });
    const data = await response.json();
    console.log('Health check data:', data);
  } catch (error) {
    console.error('Health check failed:', error);
  }
  
  // Test 2: API function call
  console.log('Test 2: API function call to getDraws');
  try {
    const draws = await getDraws(1, 0);
    console.log('Draws response:', draws);
  } catch (error) {
    console.error('getDraws failed:', error);
  }
  
  console.groupEnd();
}

// Export a debug function to check API status
export function debugApiStatus() {
  console.group('API Debug Status');
  console.log('API_URL:', API_URL);
  console.log('Current token:', getAuthToken() ? 'Token exists' : 'No token');
  console.log('Current user:', getCurrentUser());
  console.log('Headers:', getHeaders());
  console.groupEnd();
}

// Log when the module is loaded
debugLog('Module', 'API module loaded');
debugApiStatus();

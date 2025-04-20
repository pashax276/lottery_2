// src/lib/api.ts
// API client for Powerball Analyzer with enhanced logging

// Get the API URL from environment variables or use a default
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

// Configure logging
const LOG_LEVEL = 'info'; // 'debug', 'info', 'warn', 'error'

// Simple logger for the frontend
const logger = {
  debug: (message: string, data?: any) => {
    if (['debug'].includes(LOG_LEVEL)) {
      console.debug(`[API] ${message}`, data || '');
    }
  },
  info: (message: string, data?: any) => {
    if (['debug', 'info'].includes(LOG_LEVEL)) {
      console.info(`[API] ${message}`, data || '');
    }
  },
  warn: (message: string, data?: any) => {
    if (['debug', 'info', 'warn'].includes(LOG_LEVEL)) {
      console.warn(`[API] ${message}`, data || '');
    }
  },
  error: (message: string, data?: any) => {
    if (['debug', 'info', 'warn', 'error'].includes(LOG_LEVEL)) {
      console.error(`[API] ${message}`, data || '');
    }
  }
};

// Helper to get auth token
const getAuthToken = (): string | null => {
  return localStorage.getItem('token');
};

// Helper to get headers with auth token if available
const getHeaders = (includeAuth: boolean = true): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (includeAuth) {
    const token = getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  return headers;
};

// Generic fetch with logging
const fetchWithLogging = async (
  url: string, 
  options: RequestInit,
  skipAuthRedirect: boolean = false
): Promise<any> => {
  const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`;
  
  // Log request
  logger.info(`Request: ${options.method} ${fullUrl}`, {
    headers: options.headers,
    body: options.body
  });
  
  try {
    const response = await fetch(fullUrl, options);
    
    // Clone the response to read it twice (once for logging, once for return)
    let clonedResponse;
    try {
      clonedResponse = response.clone();
    } catch (e) {
      // If response can't be cloned (e.g. already consumed), continue without logging response body
      logger.warn('Could not clone response for logging', e);
    }
    
    // Check for authentication issues
    if (response.status === 401 && !skipAuthRedirect) {
      logger.warn('Authentication required - redirecting to login');
      // Clear auth token and redirect to login
      localStorage.removeItem('token');
      window.location.href = '/login';
      throw new Error('Authentication required');
    }
    
    // Check if response is ok
    if (!response.ok) {
      const errorData = await response.text();
      logger.error(`Response error: ${response.status} ${response.statusText}`, errorData);
      throw new Error(errorData || `Request failed with status ${response.status}`);
    }
    
    // Log response
    if (clonedResponse) {
      try {
        const responseData = await clonedResponse.json();
        logger.info(`Response: ${response.status}`, responseData);
      } catch (e) {
        // If response can't be parsed as JSON, log text
        const responseText = await clonedResponse.text();
        logger.info(`Response: ${response.status}`, responseText.length > 500 ? 
          responseText.substring(0, 500) + '... [truncated]' : responseText);
      }
    } else {
      logger.info(`Response: ${response.status}`, 'Body already consumed');
    }
    
    return response.json();
  } catch (error) {
    // If error is already handled (like 401), just rethrow
    if (error instanceof Error && error.message === 'Authentication required') {
      throw error;
    }
    
    // Log error
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
  
  // Convert to numbers for validation
  const numDrawNumber = typeof drawNumber === 'string' ? parseInt(drawNumber, 10) : drawNumber;
  const numWhiteBalls = whiteBalls.map(ball => typeof ball === 'string' ? parseInt(ball, 10) : ball);
  const numPowerball = typeof powerball === 'string' ? parseInt(powerball, 10) : powerball;
  
  // Check draw number
  if (isNaN(numDrawNumber) || numDrawNumber <= 0) {
    errors.push('Draw number must be a positive number');
  }
  
  // Check draw date
  if (!drawDate) {
    errors.push('Draw date is required');
  } else {
    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(drawDate)) {
      errors.push('Draw date must be in YYYY-MM-DD format');
    }
  }
  
  // Check white balls
  if (numWhiteBalls.length !== 5) {
    errors.push('Exactly 5 white balls are required');
  } else {
    // Check white ball ranges
    for (let i = 0; i < numWhiteBalls.length; i++) {
      if (isNaN(numWhiteBalls[i]) || numWhiteBalls[i] < 1 || numWhiteBalls[i] > 69) {
        errors.push(`White ball #${i + 1} must be between 1 and 69`);
      }
    }
    
    // Check for duplicates
    const uniqueWhiteBalls = new Set(numWhiteBalls);
    if (uniqueWhiteBalls.size !== 5) {
      errors.push('White balls must be unique');
    }
  }
  
  // Check powerball
  if (isNaN(numPowerball) || numPowerball < 1 || numPowerball > 26) {
    errors.push('Powerball must be between 1 and 26');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
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
  
  // Make sure white balls are sorted before sending
  const sortedWhiteBalls = [...whiteBalls].sort((a, b) => a - b);
  
  // Ensure we have proper date format (YYYY-MM-DD)
  let formattedDate = drawDate;
  if (!drawDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // Try to convert MM/DD/YYYY to YYYY-MM-DD
    const dateParts = drawDate.split('/');
    if (dateParts.length === 3) {
      const month = dateParts[0].padStart(2, '0');
      const day = dateParts[1].padStart(2, '0');
      const year = dateParts[2].length === 2 ? `20${dateParts[2]}` : dateParts[2];
      formattedDate = `${year}-${month}-${day}`;
    }
  }
  
  // Add proper error handling
  try {
    const response = await fetch(`${API_URL}/api/draws/add`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        draw_number: drawNumber,
        draw_date: formattedDate,
        white_balls: sortedWhiteBalls,
        powerball: powerball,
        jackpot_amount: jackpotAmount,
        winners: winners,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Request failed with status ${response.status}`);
    }
    
    const data = await response.json();
    
    // Verify the response
    if (!data.success) {
      throw new Error(data.detail || 'Failed to add draw');
    }
    
    return data;
  } catch (error) {
    logger.error('Error adding draw:', error);
    throw error;
  }
}

/**
 * Check numbers against a draw
 */
export async function checkNumbers(
  userId: string,
  drawNumber: number,
  numbers: number[]
) {
  logger.info('Checking numbers', { userId, drawNumber, numbers });
  
  return fetchWithLogging('/api/check_numbers', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      user_id: userId,
      draw_number: drawNumber,
      numbers: numbers,
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
 * Generate a prediction
 */
export async function generatePrediction(
  method: string = 'frequency',
  userId: string = 'anonymous'
) {
  logger.info('Generating prediction', { method, userId });
  
  return fetchWithLogging('/api/predictions', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      method: method,
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
    headers: getHeaders(false), // This endpoint doesn't require auth
  });
}

/**
 * Get hot numbers
 */
export async function getHotNumbers() {
  logger.info('Getting hot numbers');
  
  return fetchWithLogging('/api/insights/hot', {
    method: 'GET',
    headers: getHeaders(false), // This endpoint doesn't require auth
  });
}

/**
 * Get due numbers
 */
export async function getDueNumbers() {
  logger.info('Getting due numbers');
  
  return fetchWithLogging('/api/insights/due', {
    method: 'GET',
    headers: getHeaders(false), // This endpoint doesn't require auth
  });
}

/**
 * Get all draws
 */
export async function getDraws() {
  logger.info('Getting all draws');
  
  return fetchWithLogging('/api/draws', {
    method: 'GET',
    headers: getHeaders(false), // This endpoint doesn't require auth
  });
}

/**
 * Get latest draw
 */
export async function getLatestDraw() {
  logger.info('Getting latest draw');
  
  return fetchWithLogging('/api/draws/latest', {
    method: 'GET',
    headers: getHeaders(false), // This endpoint doesn't require auth
  });
}

/**
 * Get draw by number
 */
export async function getDrawByNumber(drawNumber: number) {
  logger.info('Getting draw by number', { drawNumber });
  
  return fetchWithLogging(`/api/draws/${drawNumber}`, {
    method: 'GET',
    headers: getHeaders(false), // This endpoint doesn't require auth
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
    body: JSON.stringify({
      is_winner: isWinner
    }),
  });
}

/**
 * Get predictions
 */
export async function getPredictions(method: string = 'all') {
  logger.info('Getting predictions', { method });
  
  return fetchWithLogging(`/api/predictions?method=${method}`, {
    method: 'GET',
    headers: getHeaders(false), // This endpoint doesn't require auth
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
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.text();
      logger.error('Login failed', errorData);
      throw new Error(`Login failed: ${errorData}`);
    }

    const data = await response.json();
    logger.info('Login successful', { username, userId: data.user_id });
    
    // Save auth data to localStorage
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
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        password,
        email,
      }),
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
  
  // Redirect to login page
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
  
  return {
    id: parseInt(userId),
    username,
  };
}
// API client for Powerball Analyzer

// Get the API URL from environment variables or use a default
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

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
  const response = await fetch(`${API_URL}/api/draws/add`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      draw_number: drawNumber,
      draw_date: drawDate,
      white_balls: whiteBalls,
      powerball: powerball,
      jackpot_amount: jackpotAmount,
      winners: winners,
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Handle unauthorized - redirect to login
      window.location.href = '/login';
      throw new Error('Authentication required');
    }
    const errorData = await response.text();
    throw new Error(`Failed to add draw: ${errorData}`);
  }

  return response.json();
}

/**
 * Check numbers against a draw
 */
export async function checkNumbers(
  userId: string,
  drawNumber: number,
  numbers: number[]
) {
  const response = await fetch(`${API_URL}/api/check_numbers`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      user_id: userId,
      draw_number: drawNumber,
      numbers: numbers,
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      window.location.href = '/login';
      throw new Error('Authentication required');
    }
    const errorData = await response.text();
    throw new Error(`Failed to check numbers: ${errorData}`);
  }

  return response.json();
}

/**
 * Scrape the latest Powerball draw
 */
export async function scrapePowerball() {
  const response = await fetch(`${API_URL}/api/scrape/latest`, {
    method: 'POST',
    headers: getHeaders(),
  });

  if (!response.ok) {
    if (response.status === 401) {
      window.location.href = '/login';
      throw new Error('Authentication required');
    }
    const errorData = await response.text();
    throw new Error(`Failed to scrape Powerball data: ${errorData}`);
  }

  return response.json();
}

/**
 * Generate a prediction
 */
export async function generatePrediction(
  method: string = 'frequency',
  userId: string = 'anonymous'
) {
  const response = await fetch(`${API_URL}/api/predictions`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      method: method,
      user_id: userId,
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      window.location.href = '/login';
      throw new Error('Authentication required');
    }
    const errorData = await response.text();
    throw new Error(`Failed to generate prediction: ${errorData}`);
  }

  return response.json();
}

/**
 * Get frequency analysis
 */
export async function getFrequencyAnalysis() {
  const response = await fetch(`${API_URL}/api/insights/frequency`, {
    headers: getHeaders(false), // This endpoint doesn't require auth
  });
  
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to get frequency analysis: ${errorData}`);
  }
  
  return response.json();
}

/**
 * Get hot numbers
 */
export async function getHotNumbers() {
  const response = await fetch(`${API_URL}/api/insights/hot`, {
    headers: getHeaders(false), // This endpoint doesn't require auth
  });
  
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to get hot numbers: ${errorData}`);
  }
  
  return response.json();
}

/**
 * Get due numbers
 */
export async function getDueNumbers() {
  const response = await fetch(`${API_URL}/api/insights/due`, {
    headers: getHeaders(false), // This endpoint doesn't require auth
  });
  
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to get due numbers: ${errorData}`);
  }
  
  return response.json();
}

/**
 * Get all draws
 */
export async function getDraws() {
  const response = await fetch(`${API_URL}/api/draws`, {
    headers: getHeaders(false), // This endpoint doesn't require auth
  });
  
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to get draws: ${errorData}`);
  }
  
  return response.json();
}

/**
 * Get latest draw
 */
export async function getLatestDraw() {
  const response = await fetch(`${API_URL}/api/draws/latest`, {
    headers: getHeaders(false), // This endpoint doesn't require auth
  });
  
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to get latest draw: ${errorData}`);
  }
  
  return response.json();
}

/**
 * Get predictions
 */
export async function getPredictions(method: string = 'all') {
  const response = await fetch(`${API_URL}/api/predictions?method=${method}`, {
    headers: getHeaders(false), // This endpoint doesn't require auth
  });
  
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to get predictions: ${errorData}`);
  }
  
  return response.json();
}

/**
 * Get user stats
 */
export async function getUserStats(userId: string = 'anonymous') {
  const response = await fetch(`${API_URL}/api/user_stats?user_id=${userId}`, {
    headers: getHeaders(),
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      window.location.href = '/login';
      throw new Error('Authentication required');
    }
    const errorData = await response.text();
    throw new Error(`Failed to get user stats: ${errorData}`);
  }
  
  return response.json();
}

/**
 * User login
 */
export async function login(username: string, password: string) {
  const formData = new URLSearchParams();
  formData.append('username', username);
  formData.append('password', password);

  const response = await fetch(`${API_URL}/api/auth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Login failed: ${errorData}`);
  }

  const data = await response.json();
  
  // Save auth data to localStorage
  localStorage.setItem('token', data.access_token);
  localStorage.setItem('user_id', data.user_id.toString());
  localStorage.setItem('username', data.username);
  
  return data;
}

/**
 * User registration
 */
export async function register(username: string, password: string, email?: string) {
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
    throw new Error(`Registration failed: ${errorData}`);
  }

  return response.json();
}

/**
 * User logout
 */
export function logout() {
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
  return !!getAuthToken();
}

/**
 * Get current user info
 */
export function getCurrentUser() {
  const userId = localStorage.getItem('user_id');
  const username = localStorage.getItem('username');
  
  if (!userId || !username) {
    return null;
  }
  
  return {
    id: parseInt(userId),
    username,
  };
}
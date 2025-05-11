// src/lib/simpleApi.ts

// Base fetch with error handling
const fetchAPI = async (endpoint: string, options: RequestInit = {}) => {
    try {
      const response = await fetch(endpoint, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
  
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      return await response.json();
    } catch (error) {
      console.error(`API Error (${endpoint}):`, error);
      throw error;
    }
  };
  
  // Draw-related functions
  export const getDraws = (limit: number = 20, offset: number = 0) =>
    fetchAPI(`/api/draws?limit=${limit}&offset=${offset}`);
  
  export const getLatestDraw = () =>
    fetchAPI('/api/draws/latest');
  
  export const addDraw = (data: any) =>
    fetchAPI('/api/draws/add', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  
  // Prediction functions
  export const getPredictions = (limit: number = 10) =>
    fetchAPI(`/api/predictions?limit=${limit}`);
  
  export const generatePrediction = (method: string, userId: number = 1) =>
    fetchAPI('/api/predictions', {
      method: 'POST',
      body: JSON.stringify({ method, user_id: userId }),
    });
  
  // Analysis functions
  export const getFrequencyAnalysis = () =>
    fetchAPI('/api/insights/frequency');
  
  export const getHotNumbers = () =>
    fetchAPI('/api/insights/hot');
  
  export const getDueNumbers = () =>
    fetchAPI('/api/insights/due');
  
  export const getPairs = () =>
    fetchAPI('/api/insights/pairs');
  
  export const getPositions = () =>
    fetchAPI('/api/insights/positions');
  
  // User functions
  export const checkNumbers = (drawNumber: number, numbers: number[]) =>
    fetchAPI('/api/check_numbers', {
      method: 'POST',
      body: JSON.stringify({ draw_number: drawNumber, numbers }),
    });
  
  export const scrapePowerball = () =>
    fetchAPI('/api/scrape/latest', { method: 'POST' });
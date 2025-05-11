// src/utils/dataUtils.ts - Updated with better error handling

/**
 * Process white balls array from various formats to a normalized array of numbers
 * with improved error handling to prevent "Cannot read properties of undefined" errors
 */
export function processWhiteBalls(whiteBalls: any): number[] {
  // Return default if undefined or null
  if (whiteBalls === undefined || whiteBalls === null) {
    console.warn('white_balls is undefined or null, using default');
    return [1, 2, 3, 4, 5];
  }
  
  // Handle array input
  if (Array.isArray(whiteBalls)) {
    const processed = whiteBalls
      .map(ball => {
        if (typeof ball === 'string') {
          return parseInt(ball, 10);
        }
        return ball;
      })
      .filter(ball => typeof ball === 'number' && !isNaN(ball) && ball >= 1 && ball <= 69)
      .slice(0, 5);
    
    // If we don't have 5 numbers after processing, pad with defaults
    while (processed.length < 5) {
      processed.push(processed.length + 1);
    }
    
    return processed;
  }
  
  // Handle PostgreSQL array string format like "{1,2,3,4,5}"
  if (typeof whiteBalls === 'string') {
    try {
      if (whiteBalls.startsWith('{') && whiteBalls.endsWith('}')) {
        const cleaned = whiteBalls.slice(1, -1);
        const processed = cleaned.split(',')
          .map(item => parseInt(item.trim(), 10))
          .filter(num => !isNaN(num) && num >= 1 && num <= 69)
          .slice(0, 5);
        
        // If we don't have 5 numbers after processing, pad with defaults
        while (processed.length < 5) {
          processed.push(processed.length + 1);
        }
        
        return processed;
      } else if (whiteBalls.includes(',')) {
        // Handle comma-separated string not in PostgreSQL array format
        const processed = whiteBalls.split(',')
          .map(item => parseInt(item.trim(), 10))
          .filter(num => !isNaN(num) && num >= 1 && num <= 69)
          .slice(0, 5);
        
        // If we don't have 5 numbers after processing, pad with defaults
        while (processed.length < 5) {
          processed.push(processed.length + 1);
        }
        
        return processed;
      }
    } catch (e) {
      console.error('Error processing white_balls string:', e);
    }
  }
  
  // Default fallback
  console.warn('Could not process white_balls:', whiteBalls);
  return [1, 2, 3, 4, 5];
}
  
/**
 * Process powerball from various formats to a normalized number
 * with improved error handling
 */
export function processPowerball(powerball: any): number {
  // Handle undefined or null
  if (powerball === undefined || powerball === null) {
    return 1;
  }
  
  // Handle numeric input
  if (typeof powerball === 'number' && !isNaN(powerball)) {
    return Math.max(1, Math.min(26, powerball));
  }
  
  // Handle string input
  if (typeof powerball === 'string') {
    const parsed = parseInt(powerball, 10);
    if (!isNaN(parsed)) {
      return Math.max(1, Math.min(26, parsed));
    }
  }
  
  // Handle array input (take first element)
  if (Array.isArray(powerball) && powerball.length > 0) {
    return processPowerball(powerball[0]);
  }
  
  // Default fallback
  console.warn('Could not process powerball:', powerball);
  return 1;
}

/**
 * Safely parse a string value to a number
 */
export function safelyParseNumber(value: any, defaultValue: number = 0): number {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  
  if (typeof value === 'number') {
    return isNaN(value) ? defaultValue : value;
  }
  
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  
  return defaultValue;
}
// src/utils/dataUtils.ts

/**
 * Process white balls array from various formats to a normalized array of numbers
 */
export function processWhiteBalls(whiteBalls: any): number[] {
    // Handle array input
    if (Array.isArray(whiteBalls)) {
      return whiteBalls
        .map(ball => typeof ball === 'string' ? parseInt(ball, 10) : ball)
        .filter(ball => typeof ball === 'number' && !isNaN(ball) && ball >= 1 && ball <= 69)
        .slice(0, 5);
    }
    
    // Handle PostgreSQL array string format like "{1,2,3,4,5}"
    if (typeof whiteBalls === 'string' && whiteBalls.startsWith('{') && whiteBalls.endsWith('}')) {
      const cleaned = whiteBalls.slice(1, -1);
      return cleaned.split(',')
        .map(item => parseInt(item.trim(), 10))
        .filter(num => !isNaN(num) && num >= 1 && num <= 69)
        .slice(0, 5);
    }
    
    // Handle comma-separated string
    if (typeof whiteBalls === 'string' && whiteBalls.includes(',')) {
      return whiteBalls.split(',')
        .map(item => parseInt(item.trim(), 10))
        .filter(num => !isNaN(num) && num >= 1 && num <= 69)
        .slice(0, 5);
    }
    
    // Default fallback
    console.warn('Could not process white_balls:', whiteBalls);
    return [1, 2, 3, 4, 5];
  }
  
  /**
   * Process powerball from various formats to a normalized number
   */
  export function processPowerball(powerball: any): number {
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
  
  /**
   * Check if a value is a valid array
   */
  export function isValidArray(value: any): boolean {
    return Array.isArray(value) && value.length > 0;
  }
  
  /**
   * Format a number as currency
   */
  export function formatCurrency(amount: number | string): string {
    const numericAmount = safelyParseNumber(amount);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(numericAmount);
  }
// src/utils/dataUtils.ts

/**
 * Safely parse a string value to a number
 * @param value The value to parse
 * @param defaultValue The default value to return if parsing fails
 * @returns The parsed number or the default value
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
   * @param value The value to check
   * @returns True if the value is an array and has elements
   */
  export function isValidArray(value: any): boolean {
    return Array.isArray(value) && value.length > 0;
  }
  
  /**
   * Process PostgreSQL array format
   * PostgreSQL can return arrays in a specific string format like: "{1,2,3,4,5}"
   * @param arrayValue The array value from PostgreSQL
   * @returns An array of numbers
   */
  export function processPgArray(arrayValue: any): number[] {
    // If it's already an array of numbers, return it
    if (Array.isArray(arrayValue) && arrayValue.every(item => typeof item === 'number' || typeof item === 'string')) {
      return arrayValue.map(item => typeof item === 'number' ? item : parseInt(item, 10));
    }
    
    // PostgreSQL arrays sometimes come as strings like "{1,2,3,4,5}"
    if (typeof arrayValue === 'string') {
      // Remove the curly braces and split by comma
      const trimmed = arrayValue.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        const withoutBraces = trimmed.substring(1, trimmed.length - 1);
        const items = withoutBraces.split(',');
        return items.map(item => parseInt(item.trim(), 10));
      }
      
      // Handle JSON array string format: "[1,2,3,4,5]"
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed.map(item => typeof item === 'number' ? item : parseInt(item, 10));
          }
        } catch (e) {
          console.error('Failed to parse JSON array string:', e);
        }
      }
      
      // Handle comma-separated string without braces: "1,2,3,4,5"
      if (trimmed.includes(',')) {
        return trimmed.split(',').map(item => parseInt(item.trim(), 10));
      }
      
      // Handle space-separated string: "1 2 3 4 5"
      if (trimmed.includes(' ')) {
        return trimmed.split(' ')
          .filter(item => item.trim() !== '')
          .map(item => parseInt(item.trim(), 10));
      }
    }
    
    // If we couldn't process it, return a default array with real Powerball-like numbers
    console.warn('Could not parse array value:', arrayValue);
    return [10, 20, 30, 40, 50]; // Some distinct numbers that are clearly defaults
  }
  
  /**
   * Process white balls from the database (handles PostgreSQL array format)
   * @param whiteBalls The white balls from the database
   * @returns An array of 5 numbers
   */
  export function processWhiteBalls(whiteBalls: any): number[] {
    const processed = processPgArray(whiteBalls);
    
    // Ensure we have exactly 5 elements
    if (processed.length === 5) {
      return processed;
    }
    
    // If we have more, take the first 5
    if (processed.length > 5) {
      return processed.slice(0, 5);
    }
    
    // If we have less, pad with sequential numbers
    const result = [...processed];
    for (let i = processed.length; i < 5; i++) {
      result.push(i + 1); // Add sequential numbers starting from processed.length + 1
    }
    
    return result;
  }
  
  /**
   * Process a powerball from the database
   * @param powerball The powerball value
   * @returns A number
   */
  export function processPowerball(powerball: any): number {
    // If it's a number, return it (ensuring it's within the valid range)
    if (typeof powerball === 'number') {
      return Math.max(1, Math.min(26, powerball));
    }
    
    // If it's a string, parse it
    if (typeof powerball === 'string') {
      const parsed = parseInt(powerball, 10);
      return isNaN(parsed) ? 1 : Math.max(1, Math.min(26, parsed));
    }
    
    // If it's an array (unusual but possible), take the first element
    if (Array.isArray(powerball) && powerball.length > 0) {
      const value = powerball[0];
      if (typeof value === 'number') {
        return Math.max(1, Math.min(26, value));
      }
      if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? 1 : Math.max(1, Math.min(26, parsed));
      }
    }
    
    // Default value if we couldn't process it
    return 1;
  }
  
  /**
   * Format a number as currency
   * @param amount The amount to format
   * @returns Formatted currency string
   */
  export function formatCurrency(amount: number | string): string {
    const numericAmount = safelyParseNumber(amount);
    return `$${numericAmount.toLocaleString()}`;
  }
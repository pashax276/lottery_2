// src/utils/dataProcessors.ts
// This utility file contains robust data processing functions to prevent common errors

/**
 * Safely ensure a value is an array
 * This helps prevent the dreaded "d.map is not a function" error
 */
export function ensureArray<T>(value: any, defaultValue: T[] = []): T[] {
    // Return the value if it's already an array
    if (Array.isArray(value)) {
      return value;
    }
    
    // Handle common API response formats
    if (value && typeof value === 'object') {
      // Check for common response wrappers like {data: [...]} or {results: [...]}
      if (Array.isArray(value.data)) return value.data;
      if (Array.isArray(value.results)) return value.results;
      if (Array.isArray(value.items)) return value.items;
      if (Array.isArray(value.draws)) return value.draws;
    }
    
    // Try to parse PostgreSQL array strings like "{1,2,3}"
    if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
      try {
        const content = value.slice(1, -1);
        if (!content) return [];
        
        return content.split(',').map(item => {
          const trimmed = item.trim();
          // Try to convert to number if applicable
          const num = parseFloat(trimmed);
          return isNaN(num) ? trimmed : num;
        }) as T[];
      } catch (error) {
        console.error('Failed to parse string array:', error);
      }
    }
    
    // Return default if nothing else worked
    return defaultValue;
  }
  
  /**
   * Safely convert string to number with fallback
   */
  export function safeNumber(value: any, defaultValue: number = 0): number {
    if (value === null || value === undefined) {
      return defaultValue;
    }
    
    if (typeof value === 'number' && !isNaN(value)) {
      return value;
    }
    
    if (typeof value === 'string') {
      const num = parseFloat(value);
      return isNaN(num) ? defaultValue : num;
    }
    
    return defaultValue;
  }
  
  /**
   * Process white balls array safely from any format
   */
  export function processWhiteBalls(whiteBalls: any): number[] {
    // Handle undefined or null
    if (whiteBalls === null || whiteBalls === undefined) {
      return [1, 2, 3, 4, 5];
    }
    
    // Handle array input
    if (Array.isArray(whiteBalls)) {
      // Map each value, converting strings to numbers
      const processed = whiteBalls
        .map(ball => typeof ball === 'string' ? parseInt(ball, 10) : ball)
        .filter(ball => typeof ball === 'number' && !isNaN(ball) && ball >= 1 && ball <= 69);
      
      // If we don't have 5 balls after processing, pad with defaults
      if (processed.length < 5) {
        const defaults = [1, 2, 3, 4, 5];
        for (let i = processed.length; i < 5; i++) {
          processed.push(defaults[i]);
        }
      }
      
      return processed.slice(0, 5);
    }
    
    // Handle PostgreSQL array string format like "{1,2,3,4,5}"
    if (typeof whiteBalls === 'string') {
      if (whiteBalls.startsWith('{') && whiteBalls.endsWith('}')) {
        try {
          const content = whiteBalls.slice(1, -1);
          const processed = content.split(',')
            .map(item => parseInt(item.trim(), 10))
            .filter(num => !isNaN(num) && num >= 1 && num <= 69);
          
          // Pad if needed
          if (processed.length < 5) {
            const defaults = [1, 2, 3, 4, 5];
            for (let i = processed.length; i < 5; i++) {
              processed.push(defaults[i]);
            }
          }
          
          return processed.slice(0, 5);
        } catch (e) {
          console.error('Error processing white_balls string:', e);
        }
      }
    }
    
    // Default fallback
    return [1, 2, 3, 4, 5];
  }
  
  /**
   * Process API response data safely for various components
   */
  export function processApiResponse(response: any, dataKey: string = 'data'): any[] {
    if (!response) return [];
    
    if (Array.isArray(response)) {
      return response;
    }
    
    if (response && typeof response === 'object') {
      if (dataKey in response && Array.isArray(response[dataKey])) {
        return response[dataKey];
      }
      
      // Try common keys if the specified key doesn't exist
      const commonKeys = ['data', 'results', 'items', 'draws', 'users', 'stats', dataKey];
      for (const key of commonKeys) {
        if (key in response && Array.isArray(response[key])) {
          return response[key];
        }
      }
    }
    
    console.warn('Could not extract array data from API response:', response);
    return [];
  }
  
  /**
   * Safely create an object with default values
   * This helps prevent "cannot read property of undefined" errors
   */
  export function safeObject<T>(obj: any, defaultValues: T): T {
    if (obj === null || obj === undefined) {
      return { ...defaultValues };
    }
    
    if (typeof obj !== 'object') {
      return { ...defaultValues };
    }
    
    // Create a result object with all default values
    const result = { ...defaultValues };
    
    // Override with values from the input object, if they exist
    for (const key in defaultValues) {
      if (key in obj && obj[key] !== null && obj[key] !== undefined) {
        result[key] = obj[key];
      }
    }
    
    return result;
  }
  
  /**
   * Add this function to each component that fetches or processes data
   * It will help identify and avoid common data processing issues
   */
  export function robustlyProcessData<T>(
    data: any, 
    dataKey: string = 'data', 
    processor: (item: any) => T | null = (item) => item as T,
    defaultItem: T | null = null
  ): T[] {
    try {
      // Ensure we have an array to work with
      const arrayData = ensureArray(data, []);
      
      if (arrayData.length === 0 && data && typeof data === 'object') {
        // Try to get array from a property if the data itself is not an array
        const extractedArray = processApiResponse(data, dataKey);
        
        if (extractedArray.length > 0) {
          // Process each item with the provided processor function
          return extractedArray
            .filter(item => item !== null && item !== undefined)
            .map(item => {
              try {
                const processed = processor(item);
                return processed !== null ? processed : defaultItem;
              } catch (err) {
                console.error('Error processing item:', err, item);
                return defaultItem;
              }
            })
            .filter(item => item !== null) as T[];
        }
      }
      
      // Process the array we already have
      return arrayData
        .filter(item => item !== null && item !== undefined)
        .map(item => {
          try {
            const processed = processor(item);
            return processed !== null ? processed : defaultItem;
          } catch (err) {
            console.error('Error processing item:', err, item);
            return defaultItem;
          }
        })
        .filter(item => item !== null) as T[];
    } catch (error) {
      console.error('Error in robustlyProcessData:', error);
      return [];
    }
  }
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
 * @param arrayValue The array value from PostgreSQL
 * @returns An array of numbers
 */
export function processPgArray(arrayValue: any): number[] {
    console.log('Processing array value:', arrayValue, 'Type:', typeof arrayValue);

    // Handle array input
    if (Array.isArray(arrayValue) && arrayValue.every(item => item != null && !isNaN(parseInt(item, 10)))) {
        return arrayValue.map(item => parseInt(item, 10)).filter(num => num >= 1 && num <= 69);
    }
    
    // Handle PostgreSQL string format like "{1,2,3,4,5}"
    if (typeof arrayValue === 'string') {
        const trimmed = arrayValue.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            const items = trimmed.slice(1, -1).split(',').map(item => parseInt(item.trim(), 10));
            if (items.every(num => !isNaN(num) && num >= 1 && num <= 69)) {
                return items;
            }
        }
        
        // Handle JSON array string format: "[1,2,3,4,5]"
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed) && parsed.every(item => !isNaN(parseInt(item, 10)))) {
                    return parsed.map(item => parseInt(item, 10)).filter(num => num >= 1 && num <= 69);
                }
            } catch (e) {
                console.error('Failed to parse JSON array string:', e);
            }
        }
        
        // Handle comma-separated string: "1,2,3,4,5"
        if (trimmed.includes(',')) {
            const items = trimmed.split(',').map(item => parseInt(item.trim(), 10));
            if (items.every(num => !isNaN(num) && num >= 1 && num <= 69)) {
                return items;
            }
        }
    }
    
    // Fallback for invalid or missing data
    console.warn('Could not parse array value:', arrayValue);
    return [1, 2, 3, 4, 5];
}

/**
 * Process white balls from the database
 * @param whiteBalls The white balls from the database
 * @returns An array of 5 numbers
 */
export function processWhiteBalls(whiteBalls: any): number[] {
    console.log('Processing white balls:', whiteBalls);
    const processed = processPgArray(whiteBalls);
    console.log('Processed white balls:', processed);

    // Ensure exactly 5 valid numbers (1-69)
    if (processed.length === 5 && processed.every(num => num >= 1 && num <= 69)) {
        return processed;
    }

    // If more than 5, take first 5 valid numbers
    if (processed.length > 5) {
        return processed.filter(num => num >= 1 && num <= 69).slice(0, 5);
    }

    // If fewer than 5 or invalid, pad with valid numbers
    const result = processed.filter(num => num >= 1 && num <= 69);
    while (result.length < 5) {
        result.push(result.length + 1);
    }

    return result.slice(0, 5);
}

/**
 * Process a powerball from the database
 * @param powerball The powerball value
 * @returns A number
 */
export function processPowerball(powerball: any): number {
    console.log('Processing powerball:', powerball, 'Type:', typeof powerball);

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
    
    // Handle array input (take first valid number)
    if (Array.isArray(powerball) && powerball.length > 0) {
        const value = powerball[0];
        if (typeof value === 'number' && !isNaN(value)) {
            return Math.max(1, Math.min(26, value));
        }
        if (typeof value === 'string') {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed)) {
                return Math.max(1, Math.min(26, parsed));
            }
        }
    }
    
    // Fallback
    console.warn('Could not process powerball:', powerball);
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
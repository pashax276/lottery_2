// src/utils/authFetch.ts
/**
 * This is a utility function to make authenticated API requests
 * It handles token retrieval and proper formatting of the Authorization header
 */

export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // Get the token from localStorage
  const token = localStorage.getItem('token');
  
  // Create headers with authorization if token exists
  const headers = new Headers(options.headers || {});
  
  // Set content type if not already set
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  
  // Set Authorization header if token exists
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  // Make the URL absolute if it's not already
  const apiUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
  
  // Log the request for debugging
  console.log(`[AuthFetch] ${options.method || 'GET'} ${apiUrl}`, {
    hasToken: !!token,
    tokenPreview: token ? `${token.substring(0, 10)}...` : 'none',
    headers: Object.fromEntries(headers.entries())
  });
  
  // Make the request with the updated headers
  try {
    const response = await fetch(url, {
      ...options,
      headers
    });
    
    // Log the response status
    console.log(`[AuthFetch] Response: ${response.status} ${response.statusText}`);
    
    // Handle 401 Unauthorized - you might want to redirect to login or refresh the token
    if (response.status === 401) {
      console.warn('[AuthFetch] Unauthorized: Token may be invalid or expired');
      // Optional: Redirect to login
      // window.location.href = '/login';
    }
    
    return response;
  } catch (error) {
    console.error('[AuthFetch] Fetch error:', error);
    throw error;
  }
}
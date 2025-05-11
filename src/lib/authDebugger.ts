// src/utils/authDebugger.ts
/**
 * Utility to debug authentication issues
 * Add this file to your project and call debugAuth() from the browser console
 */

export function debugAuth() {
  // Check for token in localStorage
  const token = localStorage.getItem('token');
  const userId = localStorage.getItem('user_id');
  const username = localStorage.getItem('username');
  const isAdmin = localStorage.getItem('is_admin');
  
  console.group('🔐 Auth Debugging Info');
  console.log('Token exists:', !!token);
  if (token) {
    console.log('Token length:', token.length);
    console.log('Token preview:', `${token.substring(0, 15)}...`);
    
    // Try to parse the token (it's a JWT)
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        // Decode the payload (middle part)
        const payload = JSON.parse(atob(parts[1]));
        console.log('Token payload:', payload);
        
        // Check if token is expired
        if (payload.exp) {
          const expDate = new Date(payload.exp * 1000);
          const now = new Date();
          console.log('Token expires:', expDate.toLocaleString());
          console.log('Current time:', now.toLocaleString());
          console.log('Token expired:', expDate < now ? 'YES ⚠️' : 'No ✅');
        }
      }
    } catch (e) {
      console.error('Error parsing token:', e);
    }
  }
  
  console.log('User ID:', userId);
  console.log('Username:', username);
  console.log('Is Admin:', isAdmin);
  
  // Test a fetch request with the token
  console.log('Testing API request with token...');
  fetch('/api/health', {
    headers: {
      'Authorization': token ? `Bearer ${token}` : '',
    }
  }).then(async response => {
    console.log('API Health Response Status:', response.status);
    try {
      const data = await response.json();
      console.log('API Health Response Data:', data);
    } catch (e) {
      console.error('Error parsing response:', e);
    }
  }).catch(error => {
    console.error('API request failed:', error);
  });
  
  // Check for common issues
  const issues = [];
  if (!token) issues.push('No token in localStorage');
  if (token === 'undefined') issues.push('Token is string "undefined"');
  if (token === 'null') issues.push('Token is string "null"');
  if (token && token.length < 10) issues.push('Token is too short');
  if (!userId) issues.push('No user_id in localStorage');
  if (!username) issues.push('No username in localStorage');
  
  if (issues.length > 0) {
    console.log('⚠️ Potential issues detected:');
    issues.forEach(issue => console.log(`- ${issue}`));
  } else {
    console.log('✅ No common issues detected in auth storage');
  }
  
  console.groupEnd();
  
  return {
    token,
    userId,
    username,
    isAdmin,
    issues
  };
}

// Add to window object for console access
if (typeof window !== 'undefined') {
  (window as any).debugAuth = debugAuth;
}
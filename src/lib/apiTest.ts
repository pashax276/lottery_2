// src/lib/apiTest.ts
export async function testGetDraws() {
    console.log('[apiTest] Starting test');
    try {
      const response = await fetch('/api/draws?limit=1');
      console.log('[apiTest] Response status:', response.status);
      const data = await response.json();
      console.log('[apiTest] Response data:', data);
      return data;
    } catch (error) {
      console.error('[apiTest] Error:', error);
      throw error;
    }
  }
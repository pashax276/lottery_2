import { useEffect, useState } from 'react';
import { getDraws } from '../lib/api';

interface Draw {
  id: string;
  draw_number: number;
  draw_date: string;
  white_balls: number[];
  powerball: number;
  jackpot_amount: number;
  winners: number;
  source: string;
  created_at: string;
}

export function useDraws() {
  const [draws, setDraws] = useState<Draw[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDraws() {
      try {
        setLoading(true);
        console.log('Fetching draws from API...');
        
        const response = await getDraws(1000, 0);
        console.log('Raw draw data from API:', response);
        
        if (response.success && response.draws) {
          setDraws(response.draws);
        } else {
          console.warn('No draws found in API response');
          setDraws([]);
        }
      } catch (e) {
        console.error('Error in fetchDraws:', e);
        setError(e instanceof Error ? e.message : 'An error occurred fetching draws');
      } finally {
        setLoading(false);
      }
    }

    fetchDraws();
  }, []);

  return { draws, loading, error };
}
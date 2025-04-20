import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';

type Draw = Database['public']['Tables']['draws']['Row'];

export function useDraws() {
  const [draws, setDraws] = useState<Draw[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDraws() {
      try {
        setLoading(true);
        
        // Log the query we're about to execute
        console.log('Fetching draws from Supabase...');
        
        // Use the view_all_draws view to get properly formatted data
        const { data, error } = await supabase
          .from('view_all_draws')
          .select('*')
          .order('draw_date', { ascending: false });

        if (error) {
          console.error('Error fetching draws:', error);
          throw error;
        }

        // Log the raw data received
        console.log('Raw draw data from Supabase:', data);
        
        if (data) {
          // Ensure we have the correct data structure
          const processedDraws = data.map(draw => {
            // Make sure white_balls is an array
            let whiteBalls = draw.white_balls;
            
            // If white_balls is a string, try to parse it
            if (typeof whiteBalls === 'string') {
              try {
                whiteBalls = JSON.parse(whiteBalls);
              } catch (e) {
                console.warn('Could not parse white_balls as JSON:', whiteBalls);
                // Try comma-separated format
                if (whiteBalls.includes(',')) {
                  whiteBalls = whiteBalls.split(',').map(b => parseInt(b.trim()));
                }
              }
            }
            
            return {
              ...draw,
              white_balls: Array.isArray(whiteBalls) ? whiteBalls : [],
            };
          });
          
          // Log the processed draws
          console.log('Processed draws:', processedDraws);
          
          setDraws(processedDraws);
        } else {
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
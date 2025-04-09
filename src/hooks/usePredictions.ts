import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';

type Prediction = Database['public']['Tables']['predictions']['Row'];

export function usePredictions() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPredictions() {
      try {
        const { data, error } = await supabase
          .from('predictions')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }

        setPredictions(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }

    fetchPredictions();
  }, []);

  const createPrediction = async (
    whiteBalls: number[],
    powerball: number,
    confidence: number,
    method: string
  ) => {
    try {
      const { data, error } = await supabase.from('predictions').insert({
        white_balls: whiteBalls,
        powerball,
        confidence,
        method,
        user_id: (await supabase.auth.getUser()).data.user?.id,
      });

      if (error) {
        throw error;
      }

      setPredictions((prev) => [data[0], ...prev]);
      return data[0];
    } catch (e) {
      setError(e.message);
      throw e;
    }
  };

  return { predictions, loading, error, createPrediction };
}
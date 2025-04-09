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
        const { data, error } = await supabase
          .from('draws')
          .select('*')
          .order('draw_date', { ascending: false });

        if (error) {
          throw error;
        }

        setDraws(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }

    fetchDraws();
  }, []);

  return { draws, loading, error };
}
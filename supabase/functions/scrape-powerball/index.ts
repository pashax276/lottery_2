import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const response = await fetch(
      'https://www.calottery.com/api/DrawGameApi/DrawGamePastDrawResults/9',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch Powerball data');
    }

    const data = await response.json();
    const latestDraw = data.results[0];

    const { error } = await supabaseClient
      .from('draws')
      .insert({
        draw_number: latestDraw.drawNumber,
        draw_date: latestDraw.drawDate,
        white_balls: latestDraw.numbers.slice(0, 5),
        powerball: latestDraw.numbers[5],
        jackpot_amount: latestDraw.jackpot,
        winners: latestDraw.winners,
      });

    if (error) {
      throw error;
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Draw data updated successfully' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
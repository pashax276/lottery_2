import { supabase } from './supabase';
import type { Database } from './database.types';

type Draw = Database['public']['Tables']['draws']['Row'];
type Prediction = Database['public']['Tables']['predictions']['Row'];

export async function addDraw(
  drawNumber: number,
  drawDate: string,
  whiteBalls: number[],
  powerball: number,
  jackpotAmount: number = 0,
  winners: number = 0
) {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/draws`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      draw_number: drawNumber,
      draw_date: drawDate,
      white_balls: whiteBalls,
      powerball: powerball,
      jackpot_amount: jackpotAmount,
      winners: winners,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to add draw');
  }

  return response.json();
}

export async function checkNumbers(
  userId: string,
  drawId: string,
  numbers: number[]
) {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-numbers`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_id: userId,
      draw_id: drawId,
      numbers: numbers,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to check numbers');
  }

  return response.json();
}

export async function scrapePowerball() {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-powerball`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to scrape Powerball data');
  }

  return response.json();
}

export async function generatePrediction(
  whiteBalls: number[],
  powerball: number,
  confidence: number,
  method: string
) {
  const user = await supabase.auth.getUser();
  if (!user.data.user) throw new Error('User not authenticated');

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/predictions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      white_balls: whiteBalls,
      powerball: powerball,
      confidence: confidence,
      method: method,
      user_id: user.data.user.id,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to generate prediction');
  }

  return response.json();
}
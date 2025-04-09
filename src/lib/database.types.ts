export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      draws: {
        Row: {
          id: string
          draw_number: number
          draw_date: string
          white_balls: number[]
          powerball: number
          jackpot_amount: number
          winners: number
          created_at: string
        }
        Insert: {
          id?: string
          draw_number: number
          draw_date: string
          white_balls: number[]
          powerball: number
          jackpot_amount?: number
          winners?: number
          created_at?: string
        }
        Update: {
          id?: string
          draw_number?: number
          draw_date?: string
          white_balls?: number[]
          powerball?: number
          jackpot_amount?: number
          winners?: number
          created_at?: string
        }
      }
      predictions: {
        Row: {
          id: string
          white_balls: number[]
          powerball: number
          confidence: number
          method: string
          created_at: string
          user_id: string
        }
        Insert: {
          id?: string
          white_balls: number[]
          powerball: number
          confidence: number
          method: string
          created_at?: string
          user_id: string
        }
        Update: {
          id?: string
          white_balls?: number[]
          powerball?: number
          confidence?: number
          method?: string
          created_at?: string
          user_id?: string
        }
      }
      user_checks: {
        Row: {
          id: string
          user_id: string
          draw_id: string
          numbers: number[]
          matches: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          draw_id: string
          numbers: number[]
          matches?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          draw_id?: string
          numbers?: number[]
          matches?: number
          created_at?: string
        }
      }
    }
  }
}
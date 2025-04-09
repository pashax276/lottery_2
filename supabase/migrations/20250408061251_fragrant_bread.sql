/*
  # Powerball Database Schema

  1. New Tables
    - `draws`: Stores draw results
      - `id` (uuid, primary key)
      - `draw_number` (integer, unique)
      - `draw_date` (date)
      - `white_balls` (integer array)
      - `powerball` (integer)
      - `jackpot_amount` (bigint)
      - `winners` (integer)
      - `created_at` (timestamp)
    
    - `predictions`: Stores number predictions
      - `id` (uuid, primary key)
      - `white_balls` (integer array)
      - `powerball` (integer)
      - `confidence` (float)
      - `method` (text)
      - `created_at` (timestamp)
      - `user_id` (uuid, foreign key)
    
    - `user_checks`: Stores user number checks
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key)
      - `draw_id` (uuid, foreign key)
      - `numbers` (integer array)
      - `matches` (integer)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
*/

-- Create draws table
CREATE TABLE IF NOT EXISTS draws (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_number integer UNIQUE NOT NULL,
  draw_date date NOT NULL,
  white_balls integer[] NOT NULL,
  powerball integer NOT NULL,
  jackpot_amount bigint NOT NULL DEFAULT 0,
  winners integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_white_balls CHECK (array_length(white_balls, 1) = 5),
  CONSTRAINT valid_powerball CHECK (powerball >= 1 AND powerball <= 69)
);

-- Create predictions table
CREATE TABLE IF NOT EXISTS predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  white_balls integer[] NOT NULL,
  powerball integer NOT NULL,
  confidence float NOT NULL,
  method text NOT NULL,
  created_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id),
  CONSTRAINT valid_white_balls CHECK (array_length(white_balls, 1) = 5),
  CONSTRAINT valid_powerball CHECK (powerball >= 1 AND powerball <= 69),
  CONSTRAINT valid_confidence CHECK (confidence >= 0 AND confidence <= 100)
);

-- Create user_checks table
CREATE TABLE IF NOT EXISTS user_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  draw_id uuid REFERENCES draws(id),
  numbers integer[] NOT NULL,
  matches integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_numbers CHECK (array_length(numbers, 1) = 6)
);

-- Enable Row Level Security
ALTER TABLE draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_checks ENABLE ROW LEVEL SECURITY;

-- Create policies for draws
CREATE POLICY "Draws are viewable by everyone"
  ON draws FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can insert draws"
  ON draws FOR INSERT
  TO authenticated
  USING (auth.jwt() ->> 'email' = 'admin@example.com');

-- Create policies for predictions
CREATE POLICY "Users can view their own predictions"
  ON predictions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own predictions"
  ON predictions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create policies for user_checks
CREATE POLICY "Users can view their own checks"
  ON user_checks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own checks"
  ON user_checks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
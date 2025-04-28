-- Powerball Analyzer Database Schema

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. DRAWS
CREATE TABLE IF NOT EXISTS draws (
    id SERIAL PRIMARY KEY,
    draw_number INTEGER UNIQUE NOT NULL,
    draw_date DATE NOT NULL,
    white_balls INTEGER[] NOT NULL,
    powerball INTEGER NOT NULL,
    jackpot_amount NUMERIC(15,2) DEFAULT 0,
    winners INTEGER DEFAULT 0,
    source VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_white_balls CHECK (array_length(white_balls,1)=5),
    CONSTRAINT valid_powerball CHECK (powerball>=1 AND powerball<=26)
);

-- 3. NUMBERS
CREATE TABLE IF NOT EXISTS numbers (
    id SERIAL PRIMARY KEY,
    draw_id INTEGER REFERENCES draws(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 6),
    number INTEGER NOT NULL CHECK (number BETWEEN 1 AND 69),
    is_powerball BOOLEAN DEFAULT FALSE,
    UNIQUE(draw_id, position)
);

-- 4. USER_STATS
CREATE TABLE IF NOT EXISTS user_stats (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    draws_added INTEGER DEFAULT 0,
    predictions_made INTEGER DEFAULT 0,
    analysis_runs INTEGER DEFAULT 0,
    checks_performed INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. PREDICTIONS & PREDICTION_NUMBERS
CREATE TABLE IF NOT EXISTS predictions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    method VARCHAR(50) NOT NULL,
    confidence NUMERIC(5,2) CHECK (confidence BETWEEN 0 AND 100),
    rationale TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prediction_numbers (
    id SERIAL PRIMARY KEY,
    prediction_id INTEGER REFERENCES predictions(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 6),
    number INTEGER NOT NULL CHECK (
      (position <= 5 AND number BETWEEN 1 AND 69) OR
      (position = 6 AND number BETWEEN 1 AND 26)
    ),
    is_powerball BOOLEAN DEFAULT FALSE,
    UNIQUE(prediction_id, position)
);

-- 6. EXPECTED_COMBINATIONS
CREATE TABLE IF NOT EXISTS expected_combinations (
    id SERIAL PRIMARY KEY,
    score NUMERIC(5,2) CHECK (score BETWEEN 0 AND 100),
    method VARCHAR(50) NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. USER_CHECKS
CREATE TABLE IF NOT EXISTS user_checks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    draw_id INTEGER REFERENCES draws(id) ON DELETE CASCADE,
    white_matches INTEGER[] DEFAULT '{}',
    powerball_match BOOLEAN DEFAULT FALSE,
    is_winner BOOLEAN DEFAULT FALSE,
    prize VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. ANALYSIS_RESULTS
CREATE TABLE IF NOT EXISTS analysis_results (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    parameters JSONB,
    result_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_draws_draw_number   ON draws(draw_number);
CREATE INDEX IF NOT EXISTS idx_draws_draw_date     ON draws(draw_date);
CREATE INDEX IF NOT EXISTS idx_numbers_draw_id     ON numbers(draw_id);
CREATE INDEX IF NOT EXISTS idx_numbers_number      ON numbers(number);
CREATE INDEX IF NOT EXISTS idx_predictions_user_id ON predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_checks_user_id ON user_checks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_checks_draw_id ON user_checks(draw_id);
-- …and so on for any other indexes you had…

-- VIEWS
CREATE OR REPLACE VIEW view_all_draws AS
  SELECT id, draw_number, draw_date, white_balls, powerball,
         jackpot_amount, winners, created_at
    FROM draws
   ORDER BY draw_date DESC, draw_number DESC;

CREATE OR REPLACE VIEW view_latest_draw AS
  SELECT * FROM view_all_draws LIMIT 1;

-- DEFAULT ANONYMOUS USER (idempotent)
INSERT INTO users (id, username, email, password_hash)
  VALUES (1, 'anonymous', 'anonymous@example.com', NULL)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO user_stats (user_id)
  VALUES (1)
  ON CONFLICT (user_id) DO NOTHING;

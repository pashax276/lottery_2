-- Powerball Analyzer Database Schema
-- Fixed version with proper order of operations

-- Drop tables if they exist
DROP TABLE IF EXISTS user_checks CASCADE;
DROP TABLE IF EXISTS prediction_numbers CASCADE;
DROP TABLE IF EXISTS predictions CASCADE;
DROP TABLE IF EXISTS expected_combinations CASCADE;
DROP TABLE IF EXISTS numbers CASCADE;
DROP TABLE IF EXISTS draws CASCADE;
DROP TABLE IF EXISTS user_stats CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS analysis_results CASCADE;

-- Create tables in proper order
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE draws (
    id SERIAL PRIMARY KEY,
    draw_number INTEGER UNIQUE NOT NULL,
    draw_date DATE NOT NULL,
    white_balls INTEGER[] NOT NULL,
    powerball INTEGER NOT NULL,
    jackpot_amount NUMERIC(15, 2) DEFAULT 0,
    winners INTEGER DEFAULT 0,
    source VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_white_balls CHECK (array_length(white_balls, 1) = 5),
    CONSTRAINT valid_powerball CHECK (powerball >= 1 AND powerball <= 26)
);

CREATE TABLE numbers (
    id SERIAL PRIMARY KEY,
    draw_id INTEGER REFERENCES draws(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 6),
    number INTEGER NOT NULL CHECK (number BETWEEN 1 AND 69),
    is_powerball BOOLEAN DEFAULT FALSE,
    UNIQUE (draw_id, position)
);

CREATE TABLE user_stats (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    draws_added INTEGER DEFAULT 0,
    predictions_made INTEGER DEFAULT 0,
    analysis_runs INTEGER DEFAULT 0,
    checks_performed INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE predictions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    method VARCHAR(50) NOT NULL,
    confidence NUMERIC(5, 2) CHECK (confidence BETWEEN 0 AND 100),
    rationale TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE prediction_numbers (
    id SERIAL PRIMARY KEY,
    prediction_id INTEGER REFERENCES predictions(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 6),
    number INTEGER NOT NULL CHECK (
        (position <= 5 AND number BETWEEN 1 AND 69) OR
        (position = 6 AND number BETWEEN 1 AND 26)
    ),
    is_powerball BOOLEAN DEFAULT FALSE,
    UNIQUE (prediction_id, position)
);

CREATE TABLE expected_combinations (
    id SERIAL PRIMARY KEY,
    score NUMERIC(5, 2) CHECK (score BETWEEN 0 AND 100),
    method VARCHAR(50) NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE user_checks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    draw_id INTEGER REFERENCES draws(id) ON DELETE CASCADE,
    white_matches INTEGER[] DEFAULT '{}',
    powerball_match BOOLEAN DEFAULT FALSE,
    is_winner BOOLEAN DEFAULT FALSE,
    prize VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE analysis_results (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    parameters JSONB,
    result_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_draws_draw_number ON draws(draw_number);
CREATE INDEX idx_draws_draw_date ON draws(draw_date);
CREATE INDEX idx_numbers_draw_id ON numbers(draw_id);
CREATE INDEX idx_numbers_number ON numbers(number);
CREATE INDEX idx_numbers_position ON numbers(position);
CREATE INDEX idx_prediction_numbers_prediction_id ON prediction_numbers(prediction_id);
CREATE INDEX idx_user_checks_user_id ON user_checks(user_id);
CREATE INDEX idx_user_checks_draw_id ON user_checks(draw_id);
CREATE INDEX idx_predictions_user_id ON predictions(user_id);
CREATE INDEX idx_predictions_method ON predictions(method);
CREATE INDEX idx_analysis_results_type ON analysis_results(type);

-- Create views AFTER tables exist
CREATE VIEW view_all_draws AS
SELECT 
    id, draw_number, draw_date, white_balls, powerball,
    jackpot_amount, winners, created_at
FROM draws
ORDER BY draw_date DESC, draw_number DESC;

CREATE VIEW view_latest_draw AS
SELECT * FROM view_all_draws LIMIT 1;

-- Insert a default anonymous user
INSERT INTO users (id, username, email, password_hash) VALUES
(1, 'anonymous', 'anonymous@example.com', NULL);

-- Update the sequence
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));

-- Create default user_stats for anonymous user
INSERT INTO user_stats (user_id) VALUES (1);
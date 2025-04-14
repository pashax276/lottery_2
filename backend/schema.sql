-- Powerball Analyzer Database Schema
-- Create this file at backend/schema.sql

-- Drop tables if they exist
DROP TABLE IF EXISTS user_checks CASCADE;
DROP TABLE IF EXISTS prediction_numbers CASCADE;
DROP TABLE IF EXISTS predictions CASCADE;
DROP TABLE IF EXISTS expected_combinations CASCADE;
DROP TABLE IF EXISTS numbers CASCADE;
DROP TABLE IF EXISTS draws CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS user_stats CASCADE;
DROP TABLE IF EXISTS analysis_results CASCADE;

-- Create tables
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash TEXT,  -- Add this column for authentication
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE draws (
    id SERIAL PRIMARY KEY,
    draw_number INTEGER UNIQUE NOT NULL,
    draw_date DATE NOT NULL,
    jackpot_amount NUMERIC(15, 2) DEFAULT 0,
    winners INTEGER DEFAULT 0,
    source VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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

-- Create views for common queries
CREATE VIEW view_latest_draw AS
SELECT 
    d.id, d.draw_number, d.draw_date, d.jackpot_amount, d.winners,
    array_agg(CASE WHEN n.is_powerball = false THEN n.number END ORDER BY n.position) FILTER (WHERE n.is_powerball = false) AS white_balls,
    (array_agg(n.number) FILTER (WHERE n.is_powerball = true))[1] AS powerball
FROM 
    draws d
JOIN 
    numbers n ON d.id = n.draw_id
GROUP BY 
    d.id, d.draw_number
ORDER BY 
    d.draw_date DESC, d.draw_number DESC
LIMIT 1;

CREATE VIEW view_all_draws AS
SELECT 
    d.id, d.draw_number, d.draw_date, d.jackpot_amount, d.winners,
    array_agg(CASE WHEN n.is_powerball = false THEN n.number END ORDER BY n.position) FILTER (WHERE n.is_powerball = false) AS white_balls,
    (array_agg(n.number) FILTER (WHERE n.is_powerball = true))[1] AS powerball
FROM 
    draws d
JOIN 
    numbers n ON d.id = n.draw_id
GROUP BY 
    d.id, d.draw_number
ORDER BY 
    d.draw_date DESC, d.draw_number DESC;

CREATE VIEW view_all_predictions AS
SELECT 
    p.id, p.user_id, p.method, p.confidence, p.rationale, p.created_at,
    array_agg(CASE WHEN pn.is_powerball = false THEN pn.number END ORDER BY pn.position) FILTER (WHERE pn.is_powerball = false) AS white_balls,
    (array_agg(pn.number) FILTER (WHERE pn.is_powerball = true))[1] AS powerball
FROM 
    predictions p
JOIN 
    prediction_numbers pn ON p.id = pn.prediction_id
GROUP BY 
    p.id
ORDER BY 
    p.created_at DESC;

-- Insert a default anonymous user
INSERT INTO users (id, username, email, password_hash) VALUES 
(1, 'anonymous', 'anonymous@example.com', NULL);

-- Update the sequence
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));

-- Create default user_stats for anonymous user
INSERT INTO user_stats (user_id) VALUES (1);
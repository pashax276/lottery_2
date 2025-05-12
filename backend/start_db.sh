#!/bin/bash
# backend/start_db.sh

echo "Starting Powerball Backend..."

# Wait for database to be ready
echo "Waiting for database..."
while ! pg_isready -h db -p 5432 -U powerball; do
  echo "Database is unavailable - sleeping"
  sleep 2
done

echo "Database is ready!"

# Start the main application
echo "Starting FastAPI application..."
python main.py
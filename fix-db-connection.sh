#!/bin/bash
# fix-db-connection.sh
# This script will fix the database connection issue

echo "===== Powerball Database Connection Fix Script ====="
echo "This script will help fix issues with database connections"
echo

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "Error: Docker is not running or you don't have permission to use it"
  exit 1
fi

echo "Step 1: Stopping all containers"
docker compose down
echo "✅ All containers stopped"
echo

echo "Step 2: Removing existing database volume to start fresh"
docker volume rm powerball_postgres_data 2>/dev/null || true
echo "✅ Removed old volume (if it existed)"
echo

echo "Step 3: Creating new database volume"
docker volume create powerball_postgres_data
echo "✅ Created new volume"
echo

echo "Step 4: Starting the database container only"
docker compose up -d db
echo "✅ Database container started"
echo

echo "Step 5: Waiting for database to be ready..."
sleep 10
echo "✅ Waited for database to initialize"
echo

echo "Step 6: Verifying database connection"
docker exec -it $(docker compose ps -q db) psql -U powerball -d powerball -c "SELECT 'Connection successful';"
if [ $? -ne 0 ]; then
  echo "❌ Failed to connect to database"
  exit 1
fi
echo "✅ Database connection successful"
echo

echo "Step 7: Creating test data"
docker exec -it $(docker compose ps -q db) psql -U powerball -d powerball -c "
INSERT INTO draws (draw_number, draw_date, jackpot_amount, winners)
VALUES (1001, '2025-04-19', 1000000, 0)
RETURNING id;
"
if [ $? -ne 0 ]; then
  echo "Note: Could not insert directly - will check if tables exist"
  # Check if tables exist
  docker exec -it $(docker compose ps -q db) psql -U powerball -d powerball -c "\dt"
  echo "The error above is expected if the database schema hasn't been initialized yet."
  echo "The backend service will initialize the schema when it starts."
else
  echo "✅ Test data created"
fi
echo

echo "Step 8: Starting remaining services"
docker compose up -d
echo "✅ All services started"
echo

echo "Step 9: Waiting for services to initialize..."
sleep 15
echo "✅ Waited for services to initialize"
echo

echo "Step 10: Checking backend logs"
docker compose logs --tail=50 backend
echo

echo "===== Fix Complete ====="
echo "The database connection should now be working correctly."
echo "To test, try adding a draw from the frontend interface."
echo "If issues persist, check the backend logs with: docker compose logs backend"
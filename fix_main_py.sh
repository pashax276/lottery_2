#!/bin/bash
# fix_main_py.sh - Script to automatically fix the main.py file
# This script will find and replace the problematic await pattern in main.py

set -e  # Exit on error

# Check if main.py exists
if [ ! -f backend/main.py ]; then
    echo "Error: backend/main.py not found"
    echo "Please run this script from the project root directory"
    exit 1
fi

# Create a backup
echo "Creating backup of main.py..."
cp backend/main.py backend/main.py.bak
echo "Backup created at backend/main.py.bak"

# Fix function 1: generate_prediction
echo "Fixing generate_prediction function..."
sed -i.tmp '
/async def generate_prediction/,/prediction = None/ {
    # Find the pattern we want to replace
    /user_id = 1/{
        # Store this line
        h
        # Delete next 3 lines
        n
        d
        n
        d
        n
        d
        # Get the stored line back
        g
        # Append the replacement
        a\
    if current_user:\
        user_id = current_user.get("id", 1)
    }
}' backend/main.py

# Fix function 2: check_numbers
echo "Fixing check_numbers function..."
sed -i.tmp '
/async def check_numbers/,/draw = db.get_draw_by_number/ {
    # Find the pattern we want to replace
    /user_id = 1/{
        # Store this line
        h
        # Delete next 3 lines
        n
        d
        n
        d
        n
        d
        # Get the stored line back
        g
        # Append the replacement
        a\
    if current_user:\
        user_id = current_user.get("id", 1)
    }
}' backend/main.py

# Fix function 3: get_user_statistics
echo "Fixing get_user_statistics function..."
sed -i.tmp '
/async def get_user_statistics/,/stats = db.get_user_stats/ {
    # Find the pattern we want to replace
    /user_id = 1/{
        # Store this line
        h
        # Delete next 3 lines
        n
        d
        n
        d
        n
        d
        # Get the stored line back
        g
        # Append the replacement
        a\
    if current_user:\
        user_id = current_user.get("id", 1)
    }
}' backend/main.py

# Fix function 4: get_user_checks
echo "Fixing get_user_checks function..."
sed -i.tmp '
/async def get_user_checks/,/checks = db.get_user_checks/ {
    # Find the pattern we want to replace
    /user_id = 1/{
        # Store this line
        h
        # Delete next 3 lines
        n
        d
        n
        d
        n
        d
        # Get the stored line back
        g
        # Append the replacement
        a\
    if current_user:\
        user_id = current_user.get("id", 1)
    }
}' backend/main.py

# Clean up temporary files
rm -f backend/main.py.tmp

# Check if any other instances remain
remaining=$(grep -c "await current_user" backend/main.py || true)
if [ "$remaining" -gt 0 ]; then
    echo "Warning: Found $remaining remaining instances of 'await current_user'"
    echo "Please check these manually or run the script again"
    grep -n "await current_user" backend/main.py
else
    echo "Success! All instances of the pattern have been fixed."
fi

echo "Done. You should now rebuild and restart the backend:"
echo "docker-compose build backend"
echo "docker-compose up -d"
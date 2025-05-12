#!/bin/bash
# clean_repo.sh - Script to remove unnecessary files from the Powerball Analyzer repo

set -e  # Exit on error

echo "Starting repository cleanup..."

# Create backup of the current state (optional)
BACKUP_DIR="../powerball_repo_backup_$(date +%Y%m%d_%H%M%S)"
echo "Creating backup at $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
cp -r . "$BACKUP_DIR"
echo "Backup created"

# Remove backup files
echo "Removing backup files..."
find . -name "*.bak" -type f -delete

# Remove temporary files
echo "Removing temporary files..."
find . -name "*.tmp" -type f -delete
find . -name "*.pyc" -type f -delete
find . -name "__pycache__" -type d -exec rm -rf {} +

# Remove development/debug files
echo "Removing development and debug files..."
rm -f src/components/ApiTester.tsx
rm -f src/lib/authDebugger.ts
rm -f src/utils/authDebugger.ts
rm -f fix_main_py.sh

# Remove duplicate files
echo "Removing duplicate or old versions of files..."
rm -f backend/main.py.bak

# Remove unnecessary development configurations
echo "Removing unnecessary configuration files..."
rm -f .env.development

# Remove log files (if any)
echo "Removing log files..."
find . -name "*.log" -type f -delete

# Remove unnecessary markdown files
echo "Cleaning up documentation files..."
find . -name "README.md" -size -10c -delete  # Remove empty/near-empty READMEs

# Clean node_modules and other build artifacts if needed
# Uncomment if you want to remove these
# echo "Cleaning build artifacts..."
# rm -rf node_modules
# rm -rf dist
# rm -rf __pycache__
# rm -rf backend/__pycache__

# Clean Python virtual environment if it exists
if [ -d "venv" ]; then
  echo "Removing Python virtual environment..."
  rm -rf venv
fi

# Remove any empty directories
echo "Removing empty directories..."
find . -type d -empty -delete

echo "Cleanup complete!"
echo "You may also want to consider running:"
echo "  - npm prune --production (to remove dev dependencies)"
echo "  - docker system prune (if using Docker)"
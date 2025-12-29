#!/bin/bash
# Daily incremental stopwords sync script
# Run this daily to add 100 new stopwords from pythainlp

LOG_FILE="/Users/kriangkrai/pcru-chatbot-backend-1/logs/daily_stopwords_sync.log"
ERROR_LOG="/Users/kriangkrai/pcru-chatbot-backend-1/logs/daily_stopwords_sync_error.log"

# Redirect all output to log file
exec >> "$LOG_FILE" 2>> "$ERROR_LOG"

echo "=========================================="
echo "📅 Daily Stopwords Sync - $(date)"
echo "=========================================="

cd "$(dirname "$0")/.."

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 not found!"
    exit 1
fi

# Check if required Python packages are installed
python3 -c "import pythainlp; import mysql.connector" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "❌ Required Python packages not found! Install with: pip install pythainlp mysql-connector-python"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found!"
    exit 1
fi

# Run the sync script with daily limit
DAILY_LIMIT=${DAILY_STOPWORDS_SYNC_LIMIT:-100}
echo "🚀 Starting daily stopwords sync with limit: $DAILY_LIMIT..."
python3 scripts/sync_stopwords_pythainlp.py --daily-limit $DAILY_LIMIT

EXIT_CODE=$?

echo ""
echo "=========================================="
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Daily sync completed successfully!"
else
    echo "❌ Daily sync failed with exit code $EXIT_CODE"
fi
echo "=========================================="

exit $EXIT_CODE
# Thai Stopwords Sync with pythainlp

## Installation

```bash
# Install Python dependencies
pip install pythainlp mysql-connector-python python-dotenv
```

## Automated Daily Sync (Recommended)

For automatic daily updates without manual intervention:

### 1. Configure in .env file:
```env
# Enable/disable daily sync
DAILY_STOPWORDS_SYNC_ENABLED=true

# Time to run daily sync (HH:MM format, 24-hour)
DAILY_STOPWORDS_SYNC_TIME=02:00

# Number of stopwords to add per day
DAILY_STOPWORDS_SYNC_LIMIT=100
```

### 2. Install the daily sync job:
```bash
./scripts/manage_daily_sync.sh install
```

### 3. Manage the job:
```bash
# Check status
./scripts/manage_daily_sync.sh status

# Reload after changing .env
./scripts/manage_daily_sync.sh reload

# Test run manually
./scripts/manage_daily_sync.sh test

# Uninstall
./scripts/manage_daily_sync.sh uninstall
```

## Manual Usage

```bash
# Insert all stopwords at once (default)
python scripts/sync_stopwords_pythainlp.py

# Insert in batches of 100
python scripts/sync_stopwords_pythainlp.py --batch-size 100

# Daily incremental updates (add 100 per day)
python scripts/sync_stopwords_pythainlp.py --daily-limit 100

# Or use the convenience script for daily updates
./scripts/daily_stopwords_sync.sh
```

## What it does

1. Loads Thai stopwords from pythainlp library
2. Filters out stopwords that conflict with negative keywords
3. Filters out stopwords that were previously removed by users
4. Inserts new stopwords with optional batch processing
5. Shows summary and sample stopwords

## Batch Processing Options

- **No batching** (default): Inserts all valid stopwords at once
- **Batch size**: Use `--batch-size N` to insert in chunks of N stopwords
- **Daily limit**: Use `--daily-limit N` to simulate incremental daily updates

Example output with batching:
```
📦 Processing batch 1/5 (100 words)...
   ✅ Inserted 100 stopwords in this batch
📦 Processing batch 2/5 (100 words)...
   ✅ Inserted 100 stopwords in this batch
...
```

## Environment Variables

Make sure your `.env` file has:

```env
DB_HOST=project.3bbddns.com
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=pcru_chatbot
```

## After Running

Restart your Node.js backend server to reload the stopwords cache:

```bash
npm start
# or
node server.js
```

## Troubleshooting

### pythainlp not found
```bash
pip install pythainlp
```

### MySQL connection error
- Check `.env` file for correct credentials
- Make sure MySQL server is running
- Verify database exists

### Table not found
```bash
mysql -u root -p pcru_chatbot < database/create_stopwords_table.sql
```

### Automated job not running
```bash
# Check job status
./scripts/manage_daily_sync.sh status

# Check system logs
log show --predicate 'process == "launchd"' --last 1h

# Reload job
./scripts/manage_daily_sync.sh uninstall
./scripts/manage_daily_sync.sh install
```

### Permission issues
```bash
# Make sure scripts are executable
chmod +x scripts/*.sh

# Check log file permissions
ls -la logs/
```

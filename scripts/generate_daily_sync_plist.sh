#!/bin/bash
# Generate dynamic plist for daily stopwords sync based on .env configuration

ENV_FILE="/Users/kriangkrai/pcru-chatbot-backend-1/.env"
PLIST_FILE="/Users/kriangkrai/com.pcru.chatbot.daily_stopwords_sync.plist"
TEMPLATE_FILE="/Users/kriangkrai/pcru-chatbot-backend-1/scripts/daily_sync_template.plist"

# Default values
ENABLED=true
SYNC_TIME="02:00"
SYNC_LIMIT=100

# Read .env file
if [ -f "$ENV_FILE" ]; then
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        [[ $key =~ ^[[:space:]]*# ]] && continue
        [[ -z $key ]] && continue
        
        # Remove quotes from value
        value=$(echo "$value" | sed 's/^"\(.*\)"$/\1/' | sed "s/^'\(.*\)'$/\1/")
        
        case $key in
            DAILY_STOPWORDS_SYNC_ENABLED)
                ENABLED=$(echo "$value" | tr '[:upper:]' '[:lower:]')
                ;;
            DAILY_STOPWORDS_SYNC_TIME)
                SYNC_TIME="$value"
                ;;
            DAILY_STOPWORDS_SYNC_LIMIT)
                SYNC_LIMIT="$value"
                ;;
        esac
    done < "$ENV_FILE"
fi

echo "📋 Daily Stopwords Sync Configuration:"
echo "   Enabled: $ENABLED"
echo "   Time: $SYNC_TIME"
echo "   Limit: $SYNC_LIMIT"

# Check if enabled
if [ "$ENABLED" != "true" ]; then
    echo "❌ Daily sync is disabled in .env"
    exit 1
fi

# Parse time
if [[ $SYNC_TIME =~ ^([0-9]{1,2}):([0-9]{2})$ ]]; then
    HOUR="${BASH_REMATCH[1]}"
    MINUTE="${BASH_REMATCH[2]}"
    
    # Validate hour (0-23)
    if [ "$HOUR" -lt 0 ] || [ "$HOUR" -gt 23 ]; then
        echo "❌ Invalid hour: $HOUR (must be 0-23)"
        exit 1
    fi
    
    # Validate minute (0-59)
    if [ "$MINUTE" -lt 0 ] || [ "$MINUTE" -gt 59 ]; then
        echo "❌ Invalid minute: $MINUTE (must be 0-59)"
        exit 1
    fi
else
    echo "❌ Invalid time format: $SYNC_TIME (expected HH:MM)"
    exit 1
fi

echo "✅ Parsed time: $HOUR:$MINUTE"

# Generate plist
cat > "$PLIST_FILE" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.pcru.chatbot.daily_stopwords_sync</string>
    
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/Users/kriangkrai/pcru-chatbot-backend-1/scripts/daily_stopwords_sync.sh</string>
    </array>
    
    <key>WorkingDirectory</key>
    <string>/Users/kriangkrai/pcru-chatbot-backend-1</string>
    
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>HOME</key>
        <string>/Users/kriangkrai</string>
        <key>DAILY_STOPWORDS_SYNC_LIMIT</key>
        <string>$SYNC_LIMIT</string>
    </dict>
    
    <key>StandardOutPath</key>
    <string>/Users/kriangkrai/pcru-chatbot-backend-1/logs/daily_stopwords_sync.log</string>
    
    <key>StandardErrorPath</key>
    <string>/Users/kriangkrai/pcru-chatbot-backend-1/logs/daily_stopwords_sync_error.log</string>
    
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>$HOUR</integer>
        <key>Minute</key>
        <integer>$MINUTE</integer>
    </dict>
    
    <key>RunAtLoad</key>
    <false/>
    
    <key>KeepAlive</key>
    <false/>
</dict>
</plist>
EOF

echo "✅ Generated plist file: $PLIST_FILE"
echo "📅 Job will run daily at $SYNC_TIME with limit $SYNC_LIMIT"
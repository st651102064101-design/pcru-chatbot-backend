#!/bin/bash
# Install/uninstall daily stopwords sync launchd job

PLIST_FILE="/Users/kriangkrai/com.pcru.chatbot.daily_stopwords_sync.plist"
SCRIPT_DIR="/Users/kriangkrai/pcru-chatbot-backend-1/scripts"

case "$1" in
    install)
        echo "📦 Installing daily stopwords sync job..."
        
        # Generate plist from .env configuration
        echo "🔧 Generating plist from .env configuration..."
        if ! "$SCRIPT_DIR/generate_daily_sync_plist.sh"; then
            echo "❌ Failed to generate plist"
            exit 1
        fi
        
        if [ ! -f "$PLIST_FILE" ]; then
            echo "❌ Plist file not found: $PLIST_FILE"
            exit 1
        fi

        # Copy plist to LaunchAgents
        cp "$PLIST_FILE" ~/Library/LaunchAgents/

        # Load the job
        launchctl load ~/Library/LaunchAgents/com.pcru.chatbot.daily_stopwords_sync.plist

        echo "✅ Daily stopwords sync job installed and loaded!"
        echo "📅 Job will run daily at $(grep DAILY_STOPWORDS_SYNC_TIME /Users/kriangkrai/pcru-chatbot-backend-1/.env | cut -d'=' -f2)"
        echo ""
        echo "To check status: launchctl list | grep pcru"
        echo "To view logs: tail -f /Users/kriangkrai/pcru-chatbot-backend-1/logs/daily_stopwords_sync.log"
        ;;

    uninstall)
        echo "🗑️ Uninstalling daily stopwords sync job..."

        # Unload the job
        launchctl unload ~/Library/LaunchAgents/com.pcru.chatbot.daily_stopwords_sync.plist 2>/dev/null

        # Remove plist
        rm -f ~/Library/LaunchAgents/com.pcru.chatbot.daily_stopwords_sync.plist

        echo "✅ Daily stopwords sync job uninstalled!"
        ;;

    status)
        echo "📊 Checking job status..."
        launchctl list | grep pcru || echo "❌ Job not loaded"

        echo ""
        echo "📋 Recent logs:"
        if [ -f "/Users/kriangkrai/pcru-chatbot-backend-1/logs/daily_stopwords_sync.log" ]; then
            tail -10 "/Users/kriangkrai/pcru-chatbot-backend-1/logs/daily_stopwords_sync.log"
        else
            echo "No log file found"
        fi
        ;;

    reload)
        echo "🔄 Reloading daily stopwords sync job..."
        
        # Generate new plist from updated .env
        echo "🔧 Regenerating plist from .env configuration..."
        if ! "$SCRIPT_DIR/generate_daily_sync_plist.sh"; then
            echo "❌ Failed to generate plist"
            exit 1
        fi
        
        # Unload old job
        launchctl unload ~/Library/LaunchAgents/com.pcru.chatbot.daily_stopwords_sync.plist 2>/dev/null || true
        
        # Copy new plist
        cp "$PLIST_FILE" ~/Library/LaunchAgents/
        
        # Load new job
        launchctl load ~/Library/LaunchAgents/com.pcru.chatbot.daily_stopwords_sync.plist
        
        echo "✅ Daily stopwords sync job reloaded!"
        echo "📅 Job will run daily at $(grep DAILY_STOPWORDS_SYNC_TIME /Users/kriangkrai/pcru-chatbot-backend-1/.env 2>/dev/null | cut -d'=' -f2 || echo '02:00')"
        ;;

    test)
        echo "🧪 Testing daily sync script..."
        "$SCRIPT_DIR/daily_stopwords_sync.sh"
        ;;

    *)
        echo "Usage: $0 {install|uninstall|reload|status|test}"
        echo ""
        echo "Commands:"
        echo "  install   - Install and start the daily sync job"
        echo "  uninstall - Stop and remove the daily sync job"
        echo "  reload    - Reload job with updated .env configuration"
        echo "  status    - Check job status and recent logs"
        echo "  test      - Test run the sync script manually"
        exit 1
        ;;
esac
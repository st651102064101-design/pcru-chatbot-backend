#!/usr/bin/env bash
# Wrapper to run the learnIntentHintsFromLogs job with environment loaded
set -e
cd "$(dirname "$0")/.."
# Export env from .env (simple approach) - be careful with complex values
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi
# Ensure logs dir
mkdir -p logs
# Run the job and append logs
/usr/bin/env node services/semanticData/learnIntentHintsFromLogs.js >> logs/learn_intent.log 2>&1 || true
# Run evaluation to possibly deactivate poor hints
/usr/bin/env node services/semanticData/evaluateIntentHints.js >> logs/evaluate_intent.log 2>&1 || true

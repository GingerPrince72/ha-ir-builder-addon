#!/usr/bin/with-contenv bashio

# Database lives in /data so it persists across restarts
export DB_PATH="/data/ir-config.db"
export NODE_ENV="production"
export PORT="5000"

bashio::log.info "Starting IR Config Builder on port 5000..."
exec node /app/index.cjs

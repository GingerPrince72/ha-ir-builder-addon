#!/usr/bin/with-contenv bashio

export DB_PATH="/data/ir-config.db"
export NODE_ENV="production"
export PORT="3000"

bashio::log.info "Starting Express on port 3000..."
node /app/index.cjs &

bashio::log.info "Starting nginx on port 5000..."
nginx -g "daemon off;"

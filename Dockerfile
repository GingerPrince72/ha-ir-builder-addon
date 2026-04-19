ARG BUILD_FROM
FROM $BUILD_FROM

# Install Node.js 20 and build tools for native modules
RUN apk add --no-cache nodejs npm python3 make g++ sqlite-dev

WORKDIR /app

# Copy built app
COPY index.cjs ./
COPY public/ ./public/
COPY package.json ./

# Only install the native runtime deps needed (better-sqlite3 needs a rebuild)
RUN npm install --omit=dev --ignore-scripts=false 2>&1 | tail -5

# Data directory for the SQLite database
RUN mkdir -p /data

COPY run.sh /run.sh
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]

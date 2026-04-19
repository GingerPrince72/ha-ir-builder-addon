ARG BUILD_FROM
FROM $BUILD_FROM

# Install Node.js 20, nginx, and build tools
RUN apk add --no-cache nodejs npm python3 make g++ sqlite-dev nginx

WORKDIR /app

COPY index.cjs ./
COPY public/ ./public/
COPY package.json ./
COPY nginx.conf /etc/nginx/nginx.conf

RUN npm install --omit=dev --ignore-scripts=false 2>&1 | tail -5

RUN mkdir -p /data /run/nginx

COPY run.sh /run.sh
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]

FROM node:22-slim
# build tools as fallback in case better-sqlite3 lacks a prebuilt for this platform
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN npm ci
ENV NODE_ENV=production
CMD ["npm","-w","@ssc/api","run","start"]

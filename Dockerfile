# Use an official Node.js runtime as a base image
FROM node:20-slim

# Install system dependencies (needed for compiling native npm modules like sqlite3 if required)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /usr/src/app

# Copy dependency definitions
COPY package*.json ./

# Install project dependencies
RUN npm ci --omit=dev --ignore-scripts || npm install --omit=dev --ignore-scripts
# Rebuild sqlite3 natively for the container environment
RUN npm install sqlite3 --build-from-source

# Install devDependencies temporarily to compile Vite client assets
COPY . .
RUN npm install --include=dev && npm run build

# Clean up dev dependencies to keep the image slim
RUN npm prune --omit=dev

# Expose server port
EXPOSE 3000

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Run the app
CMD ["node", "server.js"]

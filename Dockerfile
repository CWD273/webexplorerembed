FROM node:18-slim

# Install Chromium dependencies
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    libgbm-dev \
    libnss3 \
    libxss1 \
    libgtk-3-0 \
    --no-install-recommends \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy files
COPY . .

# Install dependencies
RUN npm install

# Expose port
EXPOSE 3000

# Start the app
CMD ["node", "render.js"]


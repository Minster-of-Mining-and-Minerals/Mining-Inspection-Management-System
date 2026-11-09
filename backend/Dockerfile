FROM node:20-alpine

WORKDIR /app

# Install dependencies first for better caching
COPY package*.json ./
RUN npm install --production

# Install sequelize-cli for migrations if needed at runtime
RUN npm install -g sequelize-cli

# Copy the rest of the application
COPY . .
# Scripts must have Unix line endings even when built from a Windows copy
RUN sed -i 's/\r$//' docker-start.sh

# Expose API port and Socket.IO port
EXPOSE 4001
EXPOSE 5001

# Waits for the database, creates / updates the tables and base data, then starts the API
CMD ["sh", "./docker-start.sh"]


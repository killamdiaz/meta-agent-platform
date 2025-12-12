# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /app

# Copy package and install all deps (include dev)
COPY package*.json ./
RUN npm install

# Copy rest of the frontend files
COPY . .

EXPOSE 8080

# Start Vite dev server
CMD ["npm", "run", "dev"]

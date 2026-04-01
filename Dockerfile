# ============================================
# Multi-stage Dockerfile for the Negotiation Experiment Platform
# Builds the React frontend and Node.js API server into a single image.
# ============================================

# -- Stage 1: Build the React frontend --
FROM node:20-alpine AS frontend-build
WORKDIR /app

# Install frontend dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy frontend source and build
COPY . .
# Set VITE_BACKEND=rest so the built frontend uses the REST adapter
ENV VITE_BACKEND=rest
# Default admin dashboard password — override for your own deployment:
#   docker build --build-arg VITE_ADMIN_PASSWORD=yourpassword .
ARG VITE_ADMIN_PASSWORD=umdad2026
ENV VITE_ADMIN_PASSWORD=$VITE_ADMIN_PASSWORD
# Assistant API URL — relative path works for both DSRI and local Docker Compose
# since the frontend and backend are served from the same Express server on port 3000
ENV VITE_ASSISTANT_API_URL=/api/assistant/query
RUN npm run build

# -- Stage 2: Build the Express server --
FROM node:20-alpine AS server-build
WORKDIR /app

# Install server dependencies
COPY server/package.json server/package-lock.json* ./
RUN npm ci

# Copy server source and build
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

# -- Stage 3: Production image --
FROM node:20-alpine
WORKDIR /app

# Copy built server
COPY --from=server-build /app/dist ./dist
COPY --from=server-build /app/node_modules ./node_modules
COPY --from=server-build /app/package.json ./

# Copy built frontend into the public/ directory that Express serves
COPY --from=frontend-build /app/dist ./public

# OpenShift runs containers as non-root by default
RUN chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "dist/index.js"]

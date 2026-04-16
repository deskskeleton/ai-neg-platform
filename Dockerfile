# ============================================
# Multi-stage Dockerfile for the Negotiation Experiment Platform
# Builds the React frontend and Node.js API server into a single image.
#
# Base image selection:
#   For local builds, the default `node:20-alpine` is pulled from Docker Hub.
#   For on-cluster OpenShift builds (DSRI), point NODE_IMAGE at an internal
#   ImageStream to avoid Docker Hub rate limits, e.g.:
#     oc import-image node:20-alpine --from=docker.io/library/node:20-alpine \
#       --confirm --scheduled=true
#     oc start-build neg-platform --from-dir=. --follow --wait \
#       --build-arg NODE_IMAGE=image-registry.openshift-image-registry.svc:5000/<NAMESPACE>/node:20-alpine
# ============================================

ARG NODE_IMAGE=node:20-alpine

# -- Stage 1: Builder (frontend + server compiled together) --
# A single builder stage means a single base-image pull per build (instead
# of three), which keeps Docker Hub rate limits out of our way on DSRI.
FROM ${NODE_IMAGE} AS builder
WORKDIR /app

# Install frontend deps (root package.json)
COPY package.json package-lock.json ./
RUN npm ci

# Install server deps into a separate dir so the trees don't collide
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci

# Copy all source in one go
COPY . .

# -- Build the frontend --
ENV VITE_BACKEND=rest
# Default admin dashboard password — override for your own deployment:
#   docker build --build-arg VITE_ADMIN_PASSWORD=yourpassword .
ARG VITE_ADMIN_PASSWORD=umdad2026
ENV VITE_ADMIN_PASSWORD=$VITE_ADMIN_PASSWORD
# Admin dashboard path (obscured so participants don't stumble on /admin).
# Override with: docker build --build-arg VITE_ADMIN_ROUTE=/your_path .
ARG VITE_ADMIN_ROUTE=/admin_umdad
ENV VITE_ADMIN_ROUTE=$VITE_ADMIN_ROUTE
# Assistant API URL — relative path works for both DSRI and local Docker Compose
# since the frontend and backend are served from the same Express server on port 3000
ENV VITE_ASSISTANT_API_URL=/api/assistant/query
RUN npm run build

# -- Build the server --
RUN cd server && npm run build

# -- Stage 2: Production image --
FROM ${NODE_IMAGE}
WORKDIR /app

# Copy built server
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/node_modules ./node_modules
COPY --from=builder /app/server/package.json ./

# Copy built frontend into the public/ directory that Express serves
COPY --from=builder /app/dist ./public

# OpenShift runs containers as non-root by default
RUN chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "dist/index.js"]

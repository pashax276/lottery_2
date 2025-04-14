FROM node:20-alpine AS frontend-builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Set environment variables for build
ARG VITE_API_URL=http://localhost:5001
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

FROM nginx:alpine AS frontend
COPY --from=frontend-builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

FROM python:3.11-slim AS backend

WORKDIR /app

# Install PostgreSQL client and required system dependencies
RUN apt-get update && apt-get install -y \
    postgresql-client \
    libpq-dev \
    gcc \
    python3-dev \
    build-essential \
    curl \
    bash \
    && rm -rf /var/lib/apt/lists/*

# Create data directories
RUN mkdir -p /app/data/logs /app/data/models /app/data/figures

# Copy requirements file separately to leverage Docker cache
COPY backend/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ .

# Copy admin registration script
COPY backend/register_admin.py .

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    DATABASE_URL="postgresql://powerball:powerball@db:5432/powerball" \
    PORT=5001 \
    LOG_LEVEL=info \
    SECRET_KEY="powerball_secret_key_change_in_production" \
    ADMIN_PASSWORD="powerball_admin" \
    ENABLE_SCHEDULER=true

# Expose the API port
EXPOSE 5001

# Start the application
CMD ["python", "main.py"]
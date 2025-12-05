FROM python:3.11-slim

WORKDIR /app

# Install base system dependencies and ALL Playwright-required libraries
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    wget \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libatspi2.0-0 \
    libx11-6 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install python packages first
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browser now that deps are present
RUN python -m playwright install chromium

# Copy the rest of the application code
COPY ./ /app/

# Set the source directory for Python imports
ENV PYTHONPATH=/app

# Run the ingestor script
CMD ["python", "-u", "main.py"]

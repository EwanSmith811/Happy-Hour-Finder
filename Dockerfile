FROM python:3.11-slim

WORKDIR /app

# Copy only necessary files
COPY requirements.txt ./

RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers (chromium) with dependencies
RUN playwright install --with-deps chromium

# Copy application code
COPY . /app

ENV PORT=8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "${PORT}"]
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

EXPOSE 3000

ENV NODE_ENV=production

CMD ["npm", "start"]

#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting TestSimply local setup...${NC}"

# Check if docker is running
if ! docker info > /dev/null 2>&1; then
  echo "Error: Docker is not running. Please start Docker and try again."
  exit 1
fi

# Start services
echo -e "${GREEN}Starting Docker services...${NC}"
docker-compose up -d db mailhog

# Wait for DB to be ready
echo -e "${GREEN}Waiting for database to be ready...${NC}"
until docker-compose exec -T db pg_isready -U postgres > /dev/null 2>&1; do
  echo "Waiting for database..."
  sleep 2
done

echo -e "${GREEN}Database is ready!${NC}"

# Run migrations
echo -e "${GREEN}Running database migrations...${NC}"
npx prisma migrate dev --name init_or_update

# Seed database (optional, if seed script exists)
if [ -f "scripts/seed.ts" ]; then
    echo -e "${GREEN}Seeding database...${NC}"
    npm run seed
fi

echo -e "${GREEN}Setup complete! You can now run 'npm run dev' to start the app.${NC}"

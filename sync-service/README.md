# Shopware Sync Service

This service synchronizes customer data from Shopware 6.5 to a PostgreSQL database, including sales representative assignments.

## Features

- Incremental sync based on last update timestamp
- Handles customer and sales representative relationships
- Configurable sync interval
- Detailed logging
- Docker support

## Prerequisites

- Node.js 18+
- PostgreSQL 12+
- Shopware 6.5+
- Valid Shopware admin API token

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   cd sync-service
   npm install
   ```
3. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
4. Update the `.env` file with your configuration
5. Generate Prisma client:
   ```bash
   npx prisma generate
   ```
6. Run database migrations:
   ```bash
   npx prisma migrate dev --name init
   ```

## Usage

### Run Once

```bash
npm run sync
```

### Run in Watch Mode

```bash
npm run sync:watch
```

### Run in Production

1. Build the application:
   ```bash
   npm run build
   ```
2. Start the service:
   ```bash
   npm run start:prod
   ```

## Docker

### Prerequisites

- Docker
- Docker Compose

### Running with Docker

1. Create a `.env` file based on the example
2. Start the services:
   ```bash
   docker-compose up -d
   ```

### Docker Compose Example

```yaml
version: '3.8'

services:
  app:
    build: .
    environment:
      - NODE_ENV=production
      - SHOPWARE_ADMIN_URL=${SHOPWARE_ADMIN_URL}
      - SHOPWARE_CLIENT_ID=${SHOPWARE_CLIENT_ID}
      - SHOPWARE_CLIENT_SECRET=${SHOPWARE_CLIENT_SECRET}
      - SHOPWARE_ADMIN_SCOPE=${SHOPWARE_ADMIN_SCOPE:-write}
      - POSTGRES_URL=postgres://user:password@db:5432/shopware_sync
      - SYNC_INTERVAL_MINUTES=30
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: postgres:14
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=shopware_sync
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```

## Configuration

| Environment Variable      | Required | Default | Description                                      |
|---------------------------|----------|---------|--------------------------------------------------|
| SHOPWARE_ADMIN_URL       | Yes      | -       | Base URL of your Shopware instance (without `/api`) |
| SHOPWARE_CLIENT_ID       | Yes      | -       | OAuth client ID for the Shopware Admin API       |
| SHOPWARE_CLIENT_SECRET   | Yes      | -       | OAuth client secret for the Shopware Admin API   |
| SHOPWARE_ADMIN_SCOPE     | No       | write   | OAuth scope used when requesting the token       |
| POSTGRES_URL             | Yes      | -       | PostgreSQL connection string                     |
| POSTGRES_SHADOW_URL      | No       | -       | Shadow database URL for migrations (optional)    |
| SYNC_INTERVAL_MINUTES    | No       | 30      | Sync interval in minutes                         |
| NODE_ENV                 | No       | development | Runtime environment (development/production) |
| LOG_LEVEL                | No       | info    | Logging level (error, warn, info, debug)        |

## License

MIT

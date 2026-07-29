# cohort-9-mern-7533-ahtsham

Cohort 9 MERN assignment - a notes app where users can sign up and manage their own notes.

## Stack

- Backend: Node.js, Express, TypeScript
- Frontend: React + Vite (coming soon)
- Database: MySQL (coming soon)
- Logging: Pino
- Testing: Mocha + Chai

## Setup

Needs Node 20 or above.

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Server runs on http://localhost:4000

Check it works: http://localhost:4000/api/health

## Scripts

Run these inside `backend/`:

- `npm run dev` - start server, restarts on save
- `npm test` - run tests
- `npm run typecheck` - check for type errors
- `npm run lint` - check code
- `npm run format` - format code

## Folders

```text
backend/     the API
frontend/    the React app (coming soon)
```

Inside `backend/src`:

- `config/` - reads env variables
- `middleware/` - request logging, error handling
- `routes/` - the endpoints
- `utils/` - logger setup
- `app.ts` - builds the express app
- `index.ts` - starts the server

app.ts and index.ts are split so tests can use the app without starting a real server.

## Branches

- `main` - production ready code
- `develop` - development branch
- `feature/backend/<name>` or `feature/frontend/<name>` - new features
- `bugfix/backend/<name>` or `bugfix/frontend/<name>` - fixes

All PRs go into `develop`.

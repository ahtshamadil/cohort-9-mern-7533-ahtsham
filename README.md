# cohort-9-mern-7533-ahtsham

Cohort 9 MERN assignment - a notes app where users can sign up and manage their own notes.

## Stack

- Backend: Node.js, Express, TypeScript
- Frontend: React + Vite
- Database: MySQL with Prisma
- Logging: Pino
- Testing: Mocha + Chai (backend), Jest + React Testing Library (frontend)

Note on the database: the assignment is called MERN but the required tools list
says MySQL, so I went with MySQL.

## Setup

Needs Node 20 or above, and Docker for the database.

Database first, from the repo root:

```bash
docker compose up -d
```

That starts MySQL on port 3306 and creates two databases, `notes` and `notes_test`.

Backend:

```bash
cd backend
npm install
cp .env.example .env
npm run db:migrate
npm run db:migrate:test
npm run dev
```

Server runs on http://localhost:4000

Check it works: http://localhost:4000/api/health

Frontend:

```bash
cd frontend
npm install
npm run dev
```

App runs on http://localhost:5173

Both need to be running. The frontend requests `/api/health` from its own origin
and Vite forwards that to the backend on port 4000, which is why the API needs no
CORS setup of its own.

## Scripts

Inside `backend/`:

- `npm run dev` - start server, restarts on save
- `npm test` - run tests
- `npm run typecheck` - check for type errors
- `npm run lint` - check code
- `npm run format` - format code
- `npm run db:migrate` - apply migrations to the dev database
- `npm run db:migrate:test` - same for the test database
- `npm run db:studio` - browse the data

The database tests skip themselves if MySQL is not running, so `npm test` still
works without Docker - you just get fewer tests.

Inside `frontend/`:

- `npm run dev` - start the dev server
- `npm test` - run tests
- `npm run typecheck` - check for type errors
- `npm run lint` - check code
- `npm run build` - build for production

## Folders

```text
backend/     the API
frontend/    the React app
```

Inside `backend/src`:

- `config/` - reads env variables
- `middleware/` - request logging, error handling
- `routes/` - the endpoints
- `utils/` - logger setup
- `app.ts` - builds the express app
- `index.ts` - starts the server

app.ts and index.ts are split so tests can use the app without starting a real server.

Inside `frontend/src`:

- `main.tsx` - mounts React onto the page
- `App.tsx` - the landing page, reports whether the API is reachable
- `App.test.tsx` - its test, with fetch stubbed
- `test/` - stub used for css imports during tests


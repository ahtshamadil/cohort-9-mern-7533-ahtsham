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

Needs Docker for the database, and Node 20.19+, 22.12+ or 24+ - those are the
versions Prisma 7 supports, so plain "Node 20" is not enough.

Database first, from the repo root:

```bash
docker compose up -d
```

That starts MySQL on port 3306 and creates two databases, `notes` and `notes_test`.

Backend:

```bash
cd backend
cp .env.example .env
npm install
npm run db:migrate
npm run db:migrate:test
npm run dev
```

Fill in `JWT_SECRET` in `.env` before starting - the server refuses to boot without
one, and it has to be at least 32 characters. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
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

## API

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/health` | Reports that the API is up, and whether the database answers |
| POST | `/api/auth/register` | Creates an account and signs it in |
| POST | `/api/auth/login` | Signs an existing account in |
| POST | `/api/auth/logout` | Signs out |
| GET | `/api/auth/me` | Returns the signed-in user, 401 if nobody is |

Register takes `email`, `password` and an optional `name`. Passwords need eight
characters or more, and are stored as a bcrypt hash - never in the clear, and never
sent back out.

### Sessions

Signing in returns a JSON Web Token in a cookie rather than in the response body.
The cookie is `httpOnly`, so JavaScript on the page cannot read it and a script
injected into the app cannot steal the session the way it could out of local
storage. It is also `SameSite=Lax`, which stops another site posting a form to the
API and having the browser attach the cookie to it.

The token lasts seven days by default, set by `JWT_EXPIRES_IN_SECONDS`. Logging out
deletes the cookie. The token itself stays valid until it expires - a JWT cannot be
recalled once issued, which is the trade for not having to look up a session on
every request.

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
- `db/` - the Prisma client and a reachability probe
- `middleware/` - request logging, error handling, validation, the auth guard
- `routes/` - the endpoints
- `services/` - the work behind the endpoints, kept out of the route handlers
- `types/` - extra typings, currently the user id that the auth guard attaches
- `utils/` - logger, password hashing, tokens, the session cookie
- `app.ts` - builds the express app
- `index.ts` - starts the server

app.ts and index.ts are split so tests can use the app without starting a real server.

Inside `frontend/src`:

- `main.tsx` - mounts React onto the page
- `App.tsx` - the landing page, reports whether the API is reachable
- `App.test.tsx` - its test, with fetch stubbed
- `test/` - stub used for css imports during tests


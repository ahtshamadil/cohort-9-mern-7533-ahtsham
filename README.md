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
- `App.tsx` - wraps the routes in the router and the auth context
- `AppRoutes.tsx` - the routes, kept separate so tests can mount them in a MemoryRouter
- `api/` - the fetch wrapper and the error type it throws
- `auth/` - the auth context, its provider, and the route guard
- `pages/` - one file per screen, plus a shared form field
- `test/` - the test harness, and a stub used for css imports

## Screens

| Path | Screen | Who can see it |
| --- | --- | --- |
| `/login` | Log in | Anyone |
| `/register` | Sign up | Anyone |
| `/` | Dashboard | Signed-in users only |

Registering signs you in straight away, so there is no second trip through the
log-in form.

### How the frontend knows who is signed in

It asks. The session cookie is `httpOnly`, which means JavaScript cannot read it -
that is the point of it, since a script injected into the page cannot steal a session
it cannot see. So there is nothing in the browser to inspect, and the only way to
find out is to call `GET /api/auth/me` when the app starts.

That call has three outcomes, and the guard treats them differently:

- **still waiting** - render nothing. Treating "not known yet" as "signed out" would
  bounce a signed-in user to the log-in page for a moment on every refresh
- **200** - signed in, show the dashboard
- **401** - not signed in, redirect to `/login`

No session data is kept in local storage - the only thing stored there is the chosen
theme, which is a display preference and worth nothing to anybody. Logging out clears
the cookie server-side, so a reload after it cannot get back in.

## Look and feel

The app is called **Slate**, and the name is the design brief: a slate is a stone
surface you write on. So the interface is cool stone with one warm mark on it -
chalk-grey and slate-blue for every surface, marigold for anything asking for
attention. Buttons are ink rather than a colour, inverting between the themes, which
is what keeps the marigold rare enough to still mean something.

Both themes are first-class. A small script in `index.html` applies the stored choice
before the first paint, so the page is never drawn in the wrong theme and corrected a
moment later. React reads that attribute rather than deciding again, so there is one
source of truth. Transitions are suspended for the frame in which the theme changes -
otherwise every surface cross-fades at once, and a property caught mid-transition
keeps the colour it resolved under the old theme.

Type is a system serif for anything that speaks, the system sans for controls, and a
monospace for small print. None of them are downloaded, so the app looks the same
offline and never waits on a font server.


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
| GET | `/api/notes` | Lists your notes, newest change first |
| POST | `/api/notes` | Writes a new note |
| GET | `/api/notes/:id` | Returns one note |
| PATCH | `/api/notes/:id` | Changes the fields it is given |
| DELETE | `/api/notes/:id` | Deletes a note |
| GET | `/api/notes/export` | Downloads all your notes as a JSON file |
| POST | `/api/notes/import` | Loads an export file back in |

Register takes `email`, `password` and an optional `name`. Passwords need 8 characters
or more. They get hashed with bcrypt before saving and never come back in a response.

Every note route needs a session, and every one of them is scoped to the account that
made the request. Asking for a note belonging to somebody else gives 404 rather than
403 - a 403 would confirm the note exists.

### Notes

A note has a `title` of up to 191 characters and `content` holding the rich text as
HTML. Both are checked in the service, so the rules hold whether a route validated the
request or not.

### Searching

`GET /api/notes` takes two optional query parameters:

- `q` - a word to look for, in the title or the body. Blank means no search
- `sort` - one of `recent` (the default), `oldest`, `title` or `created`

Notes are stored as HTML, so searching that directly would match tag names - a search
for "strong" would find every note with something bold in it. Each note therefore also
stores its own plain text in a second column, written on the way in, and that is the
column search reads. It never leaves the server.

Matching is case-insensitive because the tables are `utf8mb4_unicode_ci`, not because
of anything in the query. `%` and `_` in a search are escaped, so they match themselves
rather than acting as wildcards.

### Export and import

`GET /api/notes/export` sends a file of every note you own:

```json
{ "version": 1, "exportedAt": "2026-08-20T12:00:00.000Z", "notes": [] }
```

There are no ids in it, so the file can be loaded into a different account.
`POST /api/notes/import` reads the same shape back, up to 200 notes at a time, keeps
the dates each note was written with, and answers with how many arrived. One bad note
rejects the whole file rather than importing half of it.

### Sessions

When you log in the token goes into a cookie, not into the response body. The cookie
is `httpOnly`, so JavaScript can't read its value and a script injected into the page
can't copy the token out and use it somewhere else. If the token sat in local storage
it could.

That's worth being clear about though - it doesn't make XSS harmless. A script running
on the page can still call the API, because the browser attaches the cookie to
same-origin requests on its own. So `httpOnly` stops the token being taken away, not
an injected script acting as you while it runs.

It is also `SameSite=Lax`, so another site can't post a form to the API and have the
browser attach the cookie to it.

The token lasts 7 days, set by `JWT_EXPIRES_IN_SECONDS`. The cookie's max-age uses the
same value so the two expire together. Logging out clears the cookie, but the token
itself stays valid until it runs out - you can't cancel a JWT once it's issued. That's
the trade-off for not having to look up a session on every request.

### A few things worth knowing

Duplicate emails are caught from the database's unique constraint (Prisma gives error
`P2002`) rather than checking first with a `findUnique`. Checking first has a race in
it, where two signups can both see the same address as free.

Login takes the same amount of time whether the email exists or not. If it returned
straight away for an unknown email that would be fast, while a wrong password is slow
because of bcrypt. Someone could use that difference to work out which emails have
accounts, even though the message is the same either way. So when there's no account,
the password gets compared against a dummy hash instead.

Emails are lowercased and trimmed on the way in, so `Ahtsham@x.com` and
`ahtsham@x.com` are the same account.

The JWT algorithm is set to HS256 for both signing and verifying. Without that, the
token's own header gets to decide how it's checked.

`JWT_SECRET` has to be at least 32 characters and the server won't start without one.
A short key can be brute-forced offline by anyone holding a token.

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
- `utils/` - logger, password hashing, tokens, the session cookie, html to text
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
a script on the page can still call the API as you, but it cannot copy the token out
and use it somewhere else. So there is nothing in the browser to inspect, and the only
way to find out is to call `GET /api/auth/me` when the app starts.

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


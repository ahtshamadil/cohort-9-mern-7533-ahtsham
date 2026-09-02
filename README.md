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
| PATCH | `/api/auth/password` | Changes the password and signs the other sessions out |
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

### Live updates

A Socket.IO server runs on the same port as the API, at `/api/socket.io` rather than
the default `/socket.io` so one dev proxy rule covers both. It uses the same session
cookie the routes do - a socket with no valid cookie is refused the handshake, and one
whose token runs out mid-connection is dropped.

A socket asks to join the notes it wants to hear about:

```js
const answer = await socket.emitWithAck('note:join', { noteId: 9 });
// { ok: true } or { ok: false, error: 'Note not found' }
```

Joining is checked against the same rule the API uses for reading a note, and it is
checked on every join rather than once at connect - a room joined an hour ago is no
evidence that the share behind it still stands. Every socket is also put in a room of
its own account, which is how it hears about sharing.

| Event | Goes to | Carries |
| --- | --- | --- |
| `note:updated` | everybody in the note | `id`, `title`, `content`, `updatedAt` |
| `note:deleted` | everybody in the note | `id` |
| `share:granted` | the account it was shared with | `noteId` |
| `share:revoked` | the account it was taken from | `noteId` |

`note:updated` carries no `owner` and no `permission`. Both are worked out per reader -
the same note is `owner` to one account and `view` to another - so neither can go in a
message two people receive. A client merges the fields it is sent into the copy it
already holds and keeps the permission it was given. Sharing events carry only a
`noteId` for the same reason: the recipient asks for the note and gets it shaped for
them.

Saving a note sends `note:updated` to everyone else in it. Send the header
`x-socket-id` with the `PATCH` and that socket is left out of the broadcast, which is
what stops an editor's own autosave landing back on top of whatever has been typed
since. Without the header a client simply hears its own change.

Taking a share back removes that account from the note's room as well as telling it.
Otherwise a socket that joined while the share stood would keep receiving the note
after it was taken away.

Rooms are held in memory in the one server process, which is what this deployment is.
Running more than one would need an adapter so they share what is in each room.

In development the frontend talks to Vite, which forwards `/api` to the backend, so
that proxy rule needs `ws: true` for the socket to get through.

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
same value so the two expire together.

Logging out clears the cookie, but the token itself stays valid until it runs out. To
withdraw one before then, every account carries a `tokenVersion`, and every token carries
the number it was signed with. Changing the password increments it, so the tokens signed
with the old number stop verifying and the other sessions are done. The session doing the
changing gets a fresh cookie, so it stays signed in.

That costs a lookup per request, which the earlier version deliberately avoided. There is
no way to have both: a token that can be withdrawn has to be checked against something.

### Rate limits

Nothing stopped a script working through passwords at full speed, so there are three
limits, all per IP over 15 minutes:

- the auth routes, 10 attempts - login, register and changing a password
- sharing, 20 attempts - it is the one route that reacts to an address existing
- everything else, 300

Over the limit is a 429 in the same error envelope as everything else. Tests run with the
limits set high, and `createLimiter` builds one directly so the behaviour is still tested.

`req.ip` is what they count, and it is only as trustworthy as `TRUST_PROXY` says. It is 0
by default, meaning no proxy in front. Setting it when nothing is really there lets a
caller send `X-Forwarded-For` and look like a new client on every request.

### Passwords

Eight characters or more, and at most 72 bytes. The cap is not arbitrary - bcrypt reads
72 bytes and ignores the rest, so without it two different passwords sharing a 72-byte
prefix both open the same account. Bytes, not characters, because that is what bcrypt
counts and a four-byte character reaches the cap in 18 of them.

The few hundred passwords every credential stuffing list opens with are refused. That is
not a strength meter, it just removes the guesses worth trying first.

Changing a password needs the current one, and the new one has to be different.

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
- `middleware/` - request logging, error handling, validation, the auth guard, rate limits
- `routes/` - the endpoints
- `services/` - the work behind the endpoints, kept out of the route handlers
- `types/` - extra typings, currently the user id that the auth guard attaches
- `utils/` - logger, password hashing, tokens, the session cookie, html to text,
  the common password list
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
| `/notes/new` | A blank note | Signed-in users only |
| `/notes/:id` | One note | Signed-in users only |

Registering signs you in straight away, so there is no second trip through the
log-in form.

### Finding a note, and taking them with you

The dashboard toolbar holds the search box, the sort order, and the two file buttons.

Searching waits 300ms after the last keystroke before asking, so a five-letter word is
one request rather than five. What is in the box and what has actually been asked for
are kept apart, which is what lets the input stay responsive while a slower search is
still out. Answers arriving out of order are dropped rather than drawn - a search
started later wins, whichever comes back first.

An empty result says something different depending on why it is empty. No notes at all
is an invitation to write one; no notes matching a search is not.

There are two exports, and they are for different jobs.

**Export JSON** downloads the file the API builds, named by the `Content-Disposition`
the server sets rather than a name picked again here. This is the one import reads back.

**Export text** downloads a `.txt` of every note, built in the browser from the notes it
already has. It is a copy to read, print or paste elsewhere, and nothing loads it back:
plain text cannot carry bold, lists or headings, so a round trip through it would
quietly flatten every note. Keeping the two apart is what stops a backup silently
becoming worse than the thing it backed up.

Import sends a chosen file straight back without reading it first - it is already JSON,
the API checks it note by note, and a second set of rules in the browser would only be
somewhere for the two to disagree. A file that is not JSON at all comes back as the
API's own 400.

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


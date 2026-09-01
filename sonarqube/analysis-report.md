# SonarQube analysis

Static analysis of Slate — backend and frontend as one project, since they ship
together. Run against SonarQube Community 26.8 on 1 September 2026.

## Result

| Metric | Value |
| --- | --- |
| Quality gate | **Passed** |
| Lines of code | 5,146 |
| Bugs | 0 |
| Vulnerabilities | 0 |
| Security hotspots | 0 |
| Code smells | 4 |
| Coverage | 90.9% |
| Duplicated lines | 0.4% |
| Reliability / Security / Maintainability | A / A / A |
| Technical debt | 20 min |

Coverage is real, not estimated: c8 wraps Mocha and Jest runs with `--coverage`,
and Sonar reads the two `lcov.info` files. 210 backend and 174 frontend tests
pass at the analysed commit.

## What the first run found

The first analysis reported **35 code smells** and 228 minutes of debt. No bugs,
no vulnerabilities, no security hotspots — the gate passed on the first run too.
31 of the 35 were fixed. The four that remain are deliberate, and each is
explained below.

| Rule | Count | What it wanted |
| --- | --- | --- |
| S6759 | 10 | Component props marked read-only |
| S1874 | 6 | `FormEvent` is deprecated in `@types/react` 19 |
| S6819 | 6 | `<output>` for `role="status"`, `<dialog>` for `role="dialog"` |
| S5906 | 4 | Chai assertions that name what they check |
| S6551 | 2 | Values stringified as `[object Object]` |
| S8786, S6479, S7776, S7756, S7773, S7785, S7786 | 7 | One each |

## Fixed

**The tag-stripping regex (S8786).** `htmlToText` stripped markup with
`/<[^>]*>/g`. `[^>]*` cannot match `>`, so every `<` with no `>` after it
scanned to the end of the string before failing, and the next `<` did it again —
quadratic on input that is mostly angle brackets, which is a denial-of-service
shape on a field users control. Barring `<` as well bounds each attempt to the
next tag. This was the one finding with teeth.

**Deprecated `FormEvent` (S1874).** `@types/react` 19 deprecates it outright:
*"FormEvent doesn't actually exist."* Replaced with `SyntheticEvent`, which is
what the handler is actually given.

**`role="status"` → `<output>` (S6819, 4 of 6).** `<output>` carries that role
implicitly, so the live regions in the editor and the lists now say what they
are rather than being annotated.

**Duplication.** The account menu had been copied from the export menu, down to
its two listeners, and the change-password dialog held a third copy — SonarQube
scored the account menu 39% duplicated. A `useDismiss` hook replaced all three,
with what happens after a dismiss left to the caller, since only the menus move
focus back to their trigger. Project duplication fell from 2.0% to 0.4%.

**The rest.** Read-only props on every component; `Number.NaN` over the global;
`TypeError` for a value that is not a number; `reader.result` and a `Request`
no longer stringified as objects; a nested ternary given a name; toolbar
dividers keyed by name rather than array position; `linkSchemes` as a `Set`,
since membership is all it is asked for; four Chai assertions that now name what
they check.

## Not fixed, and why

**`<dialog>` instead of `role="dialog"` (S6819, ×2).** jsdom implements neither
`showModal` nor the top layer. Both dialogs are built out of a `div` for exactly
that reason, and it is written in the source: a modal that cannot be tested is
worse than one built from what the rest of the app already uses. Taking the rule
would trade 25 passing tests for a semantic tag.

**`Blob#text()` instead of `FileReader` (S7756).** Same reason. jsdom does not
implement `file.text()`, so the import path would need a shim for a method the
code can avoid using.

**Top-level `await` over a promise chain (S7785).** The flagged line pre-computes
a decoy bcrypt hash so a login against an unknown address takes the same time as
one against a real account. Awaiting it at module scope would run a cost-12
bcrypt hash on every import, including in each test file. The `.catch()` is
there to keep the rejection handled, not to sequence anything.

## Running it

```bash
docker run -d --name notes-sonarqube -p 127.0.0.1:9000:9000 sonarqube:community

npm run test:coverage --prefix backend     # c8 → backend/coverage/lcov.info
npm run test:coverage --prefix frontend    # jest → frontend/coverage/lcov.info

npx sonarqube-scanner -Dsonar.host.url=http://localhost:9000 -Dsonar.token=<token>
```

Generate the token at **My Account → Security** once the server is up. Settings
live in `sonar-project.properties` at the repository root; the generated Prisma
client and Prisma's own migration SQL are excluded, since neither is code
anybody here maintains.

`metrics.json` in this folder is the raw measures response behind the table
above. Screenshots of the dashboard are in `screenshots/`.

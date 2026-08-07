import 'dotenv/config';

import { defineConfig } from 'prisma/config';

// migrate and introspect read the connection url from here, since prisma 7
// dropped it from schema.prisma. NODE_ENV=test points the cli at the test
// database, which is how `npm run db:migrate:test` sets that one up.
const isTest = process.env.NODE_ENV === 'test';

// read straight from process.env rather than prisma's env() helper, which throws
// on a missing variable. `prisma generate` needs no database at all and runs in
// postinstall, so throwing here would break `npm install` on a fresh clone that
// has not copied .env yet. the migrate commands still fail loudly, because
// prisma reports the missing url itself when it actually needs one.
const url = isTest ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url },
});

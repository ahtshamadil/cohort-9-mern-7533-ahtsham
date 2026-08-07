import 'dotenv/config';

import { defineConfig, env } from 'prisma/config';

// migrate and introspect read the connection url from here, since prisma 7
// dropped it from schema.prisma. NODE_ENV=test points the cli at the test
// database, which is how `npm run db:migrate:test` sets that one up.
const isTest = process.env.NODE_ENV === 'test';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: isTest ? env('TEST_DATABASE_URL') : env('DATABASE_URL'),
  },
});

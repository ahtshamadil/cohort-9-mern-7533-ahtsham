// requireAuth stores the caller's id here once it has verified the cookie, so
// the routes behind it can tell who is asking without re-reading the token.
declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

// a file with no import or export is a script, not a module, and `declare
// global` is only allowed inside a module
export {};

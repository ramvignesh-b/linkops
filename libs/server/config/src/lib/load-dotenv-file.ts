import { config as parseDotenvFile } from 'dotenv';

/**
 * Merges `.env` (if present) into `process.env`, without overriding a
 * variable the shell already set — dotenv's own default precedence, and
 * the same one `loadEnvironment` assumes: an explicit shell value always
 * wins over a `.env` default. A missing file is not an error; the whole
 * point of this seam is that no `.env` file is required.
 *
 * Called explicitly, as the first line of `main.ts`'s `bootstrap()` —
 * deliberately not left to `ConfigModule.forRoot`'s own `.env` loading
 * inside `ServerConfigModule`. That module's `.env` loading only actually
 * happens to run before `loadEnvironment()` today because of *where*
 * `AppModule` currently imports it in the module graph: a `@Module()`
 * decorator's arguments evaluate once, synchronously, the first time the
 * file loads — which today lands before `bootstrap()`'s body runs, but
 * that is an accident of import order, not a guarantee. A later change to
 * what `AppModule` imports, or when, could silently stop `.env` from ever
 * being read, with no error to notice it by — exactly the kind of silent
 * failure this ticket exists to rule out. Calling this here makes `.env`
 * loading `main.ts`'s own explicit responsibility, independent of how the
 * rest of the module graph happens to be wired.
 */
export function loadDotenvFile(path?: string): void {
  parseDotenvFile(path === undefined ? undefined : { path });
}

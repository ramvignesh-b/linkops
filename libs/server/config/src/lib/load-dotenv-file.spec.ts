import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDotenvFile } from './load-dotenv-file';

/**
 * `dotenv.config()` writes straight to `process.env` — not through
 * `vi.stubEnv`, which only tracks vars it stubbed itself — so every test
 * here cleans up by hand instead of relying on `vi.unstubAllEnvs()`.
 */
describe('loadDotenvFile', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'linkops-dotenv-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env['LOAD_DOTENV_FILE_TEST_VAR'];
  });

  it('merges a var from the file into process.env', () => {
    delete process.env['LOAD_DOTENV_FILE_TEST_VAR'];
    const path = join(dir, '.env');
    writeFileSync(path, 'LOAD_DOTENV_FILE_TEST_VAR=from-file\n');

    loadDotenvFile(path);

    expect(process.env['LOAD_DOTENV_FILE_TEST_VAR']).toBe('from-file');
  });

  it('never overrides a value the shell already set', () => {
    process.env['LOAD_DOTENV_FILE_TEST_VAR'] = 'from-shell';
    const path = join(dir, '.env');
    writeFileSync(path, 'LOAD_DOTENV_FILE_TEST_VAR=from-file\n');

    loadDotenvFile(path);

    expect(process.env['LOAD_DOTENV_FILE_TEST_VAR']).toBe('from-shell');
  });

  it('does nothing, and does not throw, when the file does not exist', () => {
    expect(() => loadDotenvFile(join(dir, 'no-such-file'))).not.toThrow();
  });
});

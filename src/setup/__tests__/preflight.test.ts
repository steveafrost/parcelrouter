import fs from 'fs';
import os from 'os';
import path from 'path';
import { formatPreflight, runPreflight } from '../preflight';

function createTempProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'parcelrouter-preflight-'));
}

describe('preflight setup checks', () => {
  it('fails when required IMAP credentials are missing', () => {
    const cwd = createTempProject();

    const result = runPreflight({
      cwd,
      env: {},
    });

    expect(result.failures).toBeGreaterThanOrEqual(2);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'fail', title: 'IMAP_USER' }),
        expect.objectContaining({ status: 'fail', title: 'IMAP_PASS' }),
      ])
    );
  });

  it('passes required checks for local-only mode', () => {
    const cwd = createTempProject();
    fs.writeFileSync(
      path.join(cwd, '.env'),
      [
        'IMAP_USER=person@example.com',
        'IMAP_PASS=app-specific-password',
        'POLL_INTERVAL=3600',
        'WEBHOOK_TIMEOUT_MS=5000',
      ].join('\n')
    );

    const result = runPreflight({
      cwd,
      env: {},
    });

    expect(result.failures).toBe(0);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'ok', title: 'Environment file' }),
        expect.objectContaining({ status: 'warn', title: 'Parcel sync' }),
        expect.objectContaining({ status: 'warn', title: 'Webhooks' }),
      ])
    );
  });

  it('fails on malformed numeric and URL settings', () => {
    const cwd = createTempProject();

    const result = runPreflight({
      cwd,
      env: {
        IMAP_USER: 'person@example.com',
        IMAP_PASS: 'app-specific-password',
        IMAP_PORT: 'not-a-number',
        WEBHOOK_URL: 'ftp://example.com/hook',
      },
    });

    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'fail', title: 'IMAP port' }),
        expect.objectContaining({ status: 'fail', title: 'Webhook URL' }),
      ])
    );
  });

  it('formats a readable report', () => {
    const cwd = createTempProject();
    const result = runPreflight({
      cwd,
      env: {
        IMAP_USER: 'person@example.com',
        IMAP_PASS: 'app-specific-password',
      },
    });

    expect(formatPreflight(result)).toContain('ParcelRouter setup check');
    expect(formatPreflight(result)).toContain('[ok] IMAP_USER');
  });
});

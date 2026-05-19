import fs from 'fs';
import os from 'os';
import path from 'path';
import dotenv from 'dotenv';

type CheckStatus = 'ok' | 'warn' | 'fail';

export interface PreflightCheck {
  status: CheckStatus;
  title: string;
  detail: string;
}

export interface PreflightResult {
  checks: PreflightCheck[];
  failures: number;
  warnings: number;
}

export interface PreflightOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

interface NumberRule {
  key: string;
  defaultValue?: string;
  label: string;
  min: number;
  max?: number;
}

function hasUsableValue(value: string | undefined): boolean {
  if (!value || value.trim() === '') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return !(
    normalized.includes('your.') ||
    normalized.includes('your-') ||
    normalized.includes('abcd-efgh') ||
    normalized === 'changeme'
  );
}

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function readEnvFile(cwd: string): { exists: boolean; values: Record<string, string> } {
  const envPath = path.join(cwd, '.env');

  if (!fs.existsSync(envPath)) {
    return { exists: false, values: {} };
  }

  return {
    exists: true,
    values: dotenv.parse(fs.readFileSync(envPath)),
  };
}

function checkWritableDirectory(dir: string): PreflightCheck {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const testFile = path.join(dir, `.preflight-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    return {
      status: 'ok',
      title: 'Data directory',
      detail: `${dir} is writable`,
    };
  } catch (error) {
    return {
      status: 'fail',
      title: 'Data directory',
      detail: `${dir} is not writable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function checkNumber(env: NodeJS.ProcessEnv, rule: NumberRule): PreflightCheck {
  const rawValue = env[rule.key] || rule.defaultValue;
  const parsed = Number.parseInt(rawValue || '', 10);

  if (!Number.isFinite(parsed) || String(parsed) !== String(rawValue).trim()) {
    return {
      status: 'fail',
      title: rule.label,
      detail: `${rule.key} must be a whole number`,
    };
  }

  if (parsed < rule.min || (rule.max !== undefined && parsed > rule.max)) {
    const range = rule.max === undefined ? `at least ${rule.min}` : `between ${rule.min} and ${rule.max}`;
    return {
      status: 'fail',
      title: rule.label,
      detail: `${rule.key} must be ${range}`,
    };
  }

  return {
    status: 'ok',
    title: rule.label,
    detail: `${rule.key}=${parsed}`,
  };
}

export function runPreflight(options: PreflightOptions = {}): PreflightResult {
  const cwd = options.cwd || process.cwd();
  const envFile = readEnvFile(cwd);
  const env = {
    ...envFile.values,
    ...(options.env || process.env),
  };
  const checks: PreflightCheck[] = [];

  checks.push(
    envFile.exists
      ? {
          status: 'ok',
          title: 'Environment file',
          detail: '.env found',
        }
      : {
          status: 'warn',
          title: 'Environment file',
          detail: '.env was not found; using shell or deployment environment variables',
        }
  );

  for (const key of ['IMAP_USER', 'IMAP_PASS']) {
    checks.push(
      hasUsableValue(env[key])
        ? {
            status: 'ok',
            title: key,
            detail: `${key} is configured`,
          }
        : {
            status: 'fail',
            title: key,
            detail: `${key} is required for iCloud Mail polling`,
          }
    );
  }

  checks.push(
    hasUsableValue(env.IMAP_HOST)
      ? {
          status: 'ok',
          title: 'IMAP host',
          detail: `IMAP_HOST=${env.IMAP_HOST}`,
        }
      : {
          status: 'warn',
          title: 'IMAP host',
          detail: 'IMAP_HOST is blank; the app will use imap.mail.me.com',
        }
  );

  checks.push(
    checkNumber(env, {
      key: 'IMAP_PORT',
      defaultValue: '993',
      label: 'IMAP port',
      min: 1,
      max: 65535,
    })
  );

  checks.push(
    checkNumber(env, {
      key: 'POLL_INTERVAL',
      defaultValue: '3600',
      label: 'Polling interval',
      min: 60,
    })
  );

  checks.push(
    checkNumber(env, {
      key: 'PORT',
      defaultValue: '3000',
      label: 'Server port',
      min: 1,
      max: 65535,
    })
  );

  checks.push(checkWritableDirectory(path.join(cwd, 'data')));

  checks.push(
    hasUsableValue(env.PARCEL_API_KEY)
      ? {
          status: 'ok',
          title: 'Parcel sync',
          detail: 'PARCEL_API_KEY is configured',
        }
      : {
          status: 'warn',
          title: 'Parcel sync',
          detail: 'PARCEL_API_KEY is blank; packages will stay local',
        }
  );

  if (hasUsableValue(env.WEBHOOK_URL)) {
    checks.push(
      isValidUrl(env.WEBHOOK_URL!)
        ? {
            status: 'ok',
            title: 'Webhook URL',
            detail: 'WEBHOOK_URL is valid',
          }
        : {
            status: 'fail',
            title: 'Webhook URL',
            detail: 'WEBHOOK_URL must start with http:// or https://',
          }
    );

    checks.push(
      hasUsableValue(env.WEBHOOK_SECRET)
        ? {
            status: 'ok',
            title: 'Webhook signing',
            detail: 'WEBHOOK_SECRET is configured',
          }
        : {
            status: 'warn',
            title: 'Webhook signing',
            detail: 'WEBHOOK_URL is set without WEBHOOK_SECRET; events will not be signed',
          }
    );
  } else {
    checks.push({
      status: 'warn',
      title: 'Webhooks',
      detail: 'WEBHOOK_URL is blank; automation events are disabled',
    });

    if (hasUsableValue(env.WEBHOOK_SECRET)) {
      checks.push({
        status: 'warn',
        title: 'Webhook signing',
        detail: 'WEBHOOK_SECRET is set but WEBHOOK_URL is blank',
      });
    }
  }

  checks.push(
    checkNumber(env, {
      key: 'WEBHOOK_TIMEOUT_MS',
      defaultValue: '5000',
      label: 'Webhook timeout',
      min: 100,
    })
  );

  const failures = checks.filter(check => check.status === 'fail').length;
  const warnings = checks.filter(check => check.status === 'warn').length;
  return { checks, failures, warnings };
}

export function formatPreflight(result: PreflightResult): string {
  const lines = ['Parcel Tracker setup check', ''];

  for (const check of result.checks) {
    lines.push(`[${check.status}] ${check.title}: ${check.detail}`);
  }

  lines.push('');
  if (result.failures > 0) {
    lines.push(`Result: ${result.failures} failure(s), ${result.warnings} warning(s). Fix failures before starting the app.`);
  } else if (result.warnings > 0) {
    lines.push(`Result: ready with ${result.warnings} warning(s). Optional features may be disabled.`);
  } else {
    lines.push('Result: ready.');
  }

  return lines.join(os.EOL);
}

if (require.main === module) {
  const result = runPreflight();
  console.log(formatPreflight(result));
  process.exitCode = result.failures > 0 ? 1 : 0;
}

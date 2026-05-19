import { createHmac } from 'crypto';

export type WebhookEventName =
  | 'package.created'
  | 'package.deleted'
  | 'review.created'
  | 'review.approved'
  | 'review.ignored'
  | 'parcel.synced'
  | 'parcel.sync_failed';

export interface WebhookConfig {
  url?: string;
  secret?: string;
  timeoutMs?: number;
}

export interface WebhookEnvelope {
  event: WebhookEventName;
  timestamp: string;
  data: unknown;
}

export class WebhookDispatcher {
  constructor(private config: WebhookConfig = {}) {}

  get enabled(): boolean {
    return Boolean(this.config.url);
  }

  async dispatch(event: WebhookEventName, data: unknown): Promise<void> {
    if (!this.config.url) {
      return;
    }

    const envelope: WebhookEnvelope = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    const body = JSON.stringify(envelope);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs || 5000);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Parcel-Tracker-Event': event,
      };

      if (this.config.secret) {
        headers['X-Parcel-Tracker-Signature'] = signBody(body, this.config.secret);
      }

      const response = await fetch(this.config.url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        console.error(`Webhook ${event} failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error(`Webhook ${event} failed: ${error}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createWebhookDispatcherFromEnv(env: NodeJS.ProcessEnv = process.env): WebhookDispatcher {
  return new WebhookDispatcher({
    url: env.WEBHOOK_URL,
    secret: env.WEBHOOK_SECRET,
    timeoutMs: env.WEBHOOK_TIMEOUT_MS ? parseInt(env.WEBHOOK_TIMEOUT_MS, 10) : undefined,
  });
}

function signBody(body: string, secret: string): string {
  const digest = createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${digest}`;
}

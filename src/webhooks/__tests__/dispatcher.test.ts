import { WebhookDispatcher } from '../dispatcher';

describe('WebhookDispatcher', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('does nothing when webhook URL is not configured', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;

    const dispatcher = new WebhookDispatcher();
    await dispatcher.dispatch('package.created', { id: 'pkg_1' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('posts event envelope to configured webhook', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as any;

    const dispatcher = new WebhookDispatcher({
      url: 'https://example.com/webhook',
      secret: 'secret',
    });

    await dispatcher.dispatch('review.created', { id: 'review_1' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.com/webhook');
    expect(options.method).toBe('POST');
    expect(options.headers['X-Parcel-Tracker-Event']).toBe('review.created');
    expect(options.headers['X-Parcel-Tracker-Signature']).toMatch(/^sha256=/);

    const body = JSON.parse(options.body);
    expect(body.event).toBe('review.created');
    expect(body.data).toEqual({ id: 'review_1' });
    expect(body.timestamp).toBeDefined();
  });

  test('logs failed webhook response without throwing', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
    });
    global.fetch = fetchMock as any;
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const dispatcher = new WebhookDispatcher({ url: 'https://example.com/webhook' });

    await expect(dispatcher.dispatch('package.created', { id: 'pkg_1' })).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith('Webhook package.created failed: 500 Server Error');
  });
});

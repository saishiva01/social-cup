import { ApiClient, ApiError } from '../lib/api';

const fetchMock = jest.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('ApiClient', () => {
  let accessToken: string | null;
  let refreshCalls: number;
  let client: ApiClient;

  beforeEach(() => {
    fetchMock.mockReset();
    accessToken = 'access-1';
    refreshCalls = 0;
    client = new ApiClient({
      getAccessToken: () => accessToken,
      refreshSession: jest.fn(async () => {
        refreshCalls += 1;
        accessToken = 'access-2';
      }),
    });
  });

  it('unwraps the success envelope', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true, data: { id: 'u-1' } }));
    await expect(client.getMe()).resolves.toEqual({ id: 'u-1' });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/me'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer access-1' }),
      }),
    );
  });

  it('maps server errors to ApiError with code and message', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Request validation failed' },
      }),
    );
    await expect(
      client.register({ email: 'x', password: 'y', displayName: 'z' }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
    });
  });

  it('retries once after a 401 by refreshing the session', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { success: false, error: { code: 'UNAUTHORIZED' } }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { id: 'u-1' } }));

    const me = await client.getMe();
    expect(me).toEqual({ id: 'u-1' });
    expect(refreshCalls).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The retried request carries the fresh access token.
    const secondCall = fetchMock.mock.calls[1];
    expect(secondCall[1]).toMatchObject({ headers: { Authorization: 'Bearer access-2' } });
  });

  it('does not refresh on 401 for non-authenticated requests', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { success: false, error: { code: 'UNAUTHORIZED' } }),
    );
    await expect(client.login('a@b.c', 'password')).rejects.toMatchObject({ status: 401 });
    expect(refreshCalls).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws ApiError when not signed in for authenticated requests', async () => {
    accessToken = null;
    await expect(client.getMe()).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

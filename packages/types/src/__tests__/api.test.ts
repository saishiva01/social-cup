import { describe, expect, it } from 'vitest';

import type { ApiErrorResponse, ApiSuccessResponse, PaginatedResult } from '../api.js';

describe('API envelope shapes', () => {
  it('a success response narrows on success: true', () => {
    const response: ApiSuccessResponse<{ id: string }> = {
      success: true,
      data: { id: '1' },
    };
    expect(response.success).toBe(true);
    expect(response.data.id).toBe('1');
  });

  it('an error response carries a stable code and requestId', () => {
    const response: ApiErrorResponse = {
      success: false,
      error: { code: 'NOT_FOUND', message: 'missing' },
      meta: { requestId: 'req-1' },
    };
    expect(response.success).toBe(false);
    expect(response.meta.requestId).toBe('req-1');
  });

  it('a paginated result reports total pages independently of items length', () => {
    const result: PaginatedResult<number> = {
      items: [1, 2],
      page: 1,
      pageSize: 2,
      totalItems: 5,
      totalPages: 3,
    };
    expect(result.totalPages).toBe(3);
  });
});

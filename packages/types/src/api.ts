/**
 * Envelope shapes returned by the API. Every route responds with one of
 * these two shapes so clients can branch on `success` alone.
 */
export interface ApiSuccessResponse<TData> {
  success: true;
  data: TData;
  meta?: {
    requestId: string;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    /** Stable machine-readable code, e.g. "VALIDATION_ERROR", "UNAUTHORIZED". */
    code: string;
    message: string;
    /** Present for validation errors: field path -> issue messages. */
    details?: Record<string, string[]>;
  };
  meta: {
    requestId: string;
  };
}

export type ApiResponse<TData> = ApiSuccessResponse<TData> | ApiErrorResponse;

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<TItem> {
  items: TItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

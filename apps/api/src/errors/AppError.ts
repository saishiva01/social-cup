/**
 * Base class for every error that should be turned into a well-formed API
 * error response. Anything thrown that is NOT an AppError is treated as an
 * unexpected 500 and logged with full detail but never leaked to the client.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, string[]>;

  constructor(
    code: string,
    message: string,
    statusCode: number,
    details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, string[]>) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', message, 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super('FORBIDDEN', message, 403);
    this.name = 'ForbiddenError';
  }
}

/**
 * Login rejected because the account's email is unverified. Only reachable
 * with a correct password, so the distinct code reveals nothing to an
 * attacker who does not already know the credentials — and lets the client
 * offer the resend-verification flow.
 */
export class EmailNotVerifiedError extends AppError {
  constructor(message = 'Please verify your email address before signing in') {
    super('EMAIL_NOT_VERIFIED', message, 403);
    this.name = 'EmailNotVerifiedError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super('NOT_FOUND', message, 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message, 409);
    this.name = 'ConflictError';
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests') {
    super('TOO_MANY_REQUESTS', message, 429);
    this.name = 'TooManyRequestsError';
  }
}

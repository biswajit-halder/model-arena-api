export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'QUOTA_EXHAUSTED'
  | 'UPSTREAM_ERROR'
  | 'MODEL_NOT_FREE'
  | 'NOT_FOUND'
  | 'INTERNAL';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status: number,
    message: string,
    public readonly retryable: boolean = false,
    public readonly details?: unknown,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = new.target.name;
  }

  toBody() {
    return {
      error: {
        code: this.code,
        message: this.message,
        retryable: this.retryable,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Request validation failed', details?: unknown) {
    super('VALIDATION_ERROR', 400, message, false, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'A valid API key is required') {
    super('UNAUTHORIZED', 401, message);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Rate limit exceeded for this API key', retryAfter = 60) {
    super('RATE_LIMITED', 429, message, true, undefined, retryAfter);
  }
}

export class QuotaExhaustedError extends AppError {
  constructor(retryAfter = 86_400) {
    super(
      'QUOTA_EXHAUSTED',
      429,
      'Shared OpenRouter free-model daily quota exhausted. Cached battles are still available.',
      true,
      undefined,
      retryAfter,
    );
  }
}

export class UpstreamError extends AppError {
  constructor(message = 'All models failed', details?: unknown) {
    super('UPSTREAM_ERROR', 502, message, true, details);
  }
}

export class ModelNotFreeError extends AppError {
  constructor(model: string) {
    super('MODEL_NOT_FREE', 400, `Model "${model}" is not in the current free-model list`, false, {
      model,
    });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super('NOT_FOUND', 404, message);
  }
}

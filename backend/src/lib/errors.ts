import { FastifyError } from 'fastify'

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const Errors = {
  // Auth
  USER_NOT_FOUND:      () => new AppError('AUTH_USER_NOT_FOUND', 'User not found', 404),
  INVALID_PASSWORD:    () => new AppError('AUTH_INVALID_PASSWORD', 'Invalid credentials', 401),
  USERNAME_TAKEN:      () => new AppError('AUTH_USERNAME_TAKEN', 'Username already taken', 409),
  EMAIL_TAKEN:         () => new AppError('AUTH_EMAIL_TAKEN', 'Email already in use', 409),
  TOKEN_EXPIRED:       () => new AppError('AUTH_TOKEN_EXPIRED', 'Token expired', 401),
  TOKEN_INVALID:       () => new AppError('AUTH_TOKEN_INVALID', 'Invalid token', 401),
  SESSION_REVOKED:     () => new AppError('AUTH_SESSION_REVOKED', 'Session has been revoked', 401),
  SESSION_NOT_FOUND:   () => new AppError('AUTH_SESSION_NOT_FOUND', 'Session not found', 404),
  UNAUTHORIZED:        () => new AppError('AUTH_UNAUTHORIZED', 'Authentication required', 401),
  FORBIDDEN:           () => new AppError('AUTH_FORBIDDEN', 'Insufficient permissions', 403),
  RESET_TOKEN_INVALID: () => new AppError('AUTH_RESET_TOKEN_INVALID', 'Reset link is invalid or expired', 400),
  // Profile
  USERNAME_INVALID:    () => new AppError('PROFILE_USERNAME_INVALID', 'Username may only contain lowercase letters, numbers and underscores', 400),
  AVATAR_TOO_LARGE:    () => new AppError('PROFILE_AVATAR_TOO_LARGE', 'Avatar must be under 5 MB', 400),
  AVATAR_INVALID_TYPE: () => new AppError('PROFILE_AVATAR_INVALID_TYPE', 'Avatar must be JPEG, PNG, GIF or WebP', 400),
} as const

export function isFastifyError(err: unknown): err is FastifyError {
  return typeof err === 'object' && err !== null && 'statusCode' in err
}

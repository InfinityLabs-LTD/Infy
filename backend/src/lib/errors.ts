import { FastifyError } from 'fastify'

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly statusCode: number = 400,
    // Доп. данные для клиента (например, срок действия санкции).
    public readonly details?: Record<string, unknown>,
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
  CURRENT_PASSWORD_WRONG: () => new AppError('AUTH_CURRENT_PASSWORD_WRONG', 'Current password is incorrect', 400),
  SAME_PASSWORD:       () => new AppError('AUTH_SAME_PASSWORD', 'New password must differ from the current one', 400),
  USERNAME_RESERVED:   () => new AppError('AUTH_USERNAME_RESERVED', 'This username is reserved by the system', 409),
  // Email binding / verification
  EMAIL_SENDING_DISABLED: () => new AppError('EMAIL_SENDING_DISABLED', 'Email sending is not configured', 503),
  EMAIL_SEND_FAILED:   () => new AppError('EMAIL_SEND_FAILED', 'Failed to send the email. Try again later', 502),
  EMAIL_ALREADY_BOUND: () => new AppError('EMAIL_ALREADY_BOUND', 'A verified email is already bound to this account', 409),
  EMAIL_VERIFY_CODE_INVALID: () => new AppError('EMAIL_VERIFY_CODE_INVALID', 'Verification code is invalid or expired', 400),
  // Username change
  EMAIL_REQUIRED_FOR_USERNAME: () => new AppError('EMAIL_REQUIRED_FOR_USERNAME', 'Bind and verify an email before changing your username', 403),
  // Moderation (Infy Shield) enforcement
  ACCOUNT_BANNED:      (reason: string, expiresAt: Date | null) =>
    new AppError('MOD_ACCOUNT_BANNED', reason, 403, { expiresAt: expiresAt?.toISOString() ?? null }),
  ACCOUNT_MUTED:       (reason: string, expiresAt: Date | null) =>
    new AppError('MOD_ACCOUNT_MUTED', reason, 403, { expiresAt: expiresAt?.toISOString() ?? null }),
  // Profile
  USERNAME_INVALID:    () => new AppError('PROFILE_USERNAME_INVALID', 'Username may only contain lowercase letters, numbers and underscores', 400),
  AVATAR_TOO_LARGE:    () => new AppError('PROFILE_AVATAR_TOO_LARGE', 'Avatar must be under 5 MB', 400),
  AVATAR_INVALID_TYPE: () => new AppError('PROFILE_AVATAR_INVALID_TYPE', 'Avatar must be JPEG, PNG, GIF or WebP', 400),
} as const

export function isFastifyError(err: unknown): err is FastifyError {
  return typeof err === 'object' && err !== null && 'statusCode' in err
}

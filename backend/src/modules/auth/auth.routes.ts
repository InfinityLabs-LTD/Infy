import { FastifyPluginAsync } from 'fastify'
import { env } from '../../lib/env.js'
import { authenticate } from '../../middleware/authenticate.js'
import { AppError } from '../../lib/errors.js'
import { hashRefreshToken } from '../../lib/jwt.js'
import * as AuthService from './auth.service.js'
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from './auth.schema.js'

const authRoutes: FastifyPluginAsync = async (app) => {
  // POST /auth/register
  app.post('/register', {
    config: {
      rateLimit: {
        max: env.RATE_LIMIT_REGISTER_MAX,
        timeWindow: env.RATE_LIMIT_REGISTER_WINDOW_MS,
      },
    },
    schema: {
      tags: ['Auth'],
      summary: 'Register a new user',
      body: {
        type: 'object',
        required: ['username', 'nickname', 'password'],
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 32 },
          nickname: { type: 'string', minLength: 1, maxLength: 64 },
          password: { type: 'string', minLength: 8, maxLength: 128 },
          email: { type: 'string', format: 'email' },
          birthdate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        },
      },
    },
  }, async (request, reply) => {
    const input = registerSchema.parse(request.body)
    const result = await AuthService.register(app.prisma, app.redis, input, {
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    })
    return reply.code(201).send({ data: result })
  })

  // POST /auth/login
  app.post('/login', {
    config: {
      rateLimit: {
        max: env.RATE_LIMIT_LOGIN_MAX,
        timeWindow: env.RATE_LIMIT_LOGIN_WINDOW_MS,
      },
    },
    schema: {
      tags: ['Auth'],
      summary: 'Login with username and password',
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const input = loginSchema.parse(request.body)
    const result = await AuthService.login(app.prisma, app.redis, input, {
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    })
    return reply.send({ data: result })
  })

  // POST /auth/refresh
  app.post('/refresh', {
    schema: {
      tags: ['Auth'],
      summary: 'Rotate refresh token',
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const input = refreshSchema.parse(request.body)
    const result = await AuthService.refresh(app.prisma, app.redis, input.refreshToken, {
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    })
    return reply.send({ data: result })
  })

  // POST /auth/forgot-password — запросить письмо для сброса пароля.
  // Всегда возвращает 204, даже если email не найден (не раскрываем наличие аккаунта).
  app.post('/forgot-password', {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: 3600000,
      },
    },
    schema: {
      tags: ['Auth'],
      summary: 'Request a password reset email',
      body: {
        type: 'object',
        required: ['email'],
        properties: { email: { type: 'string', format: 'email' } },
      },
    },
  }, async (request, reply) => {
    const { email } = request.body as { email: string }
    await AuthService.requestPasswordReset(app.prisma, email)
    return reply.code(204).send()
  })

  // GET /auth/reset-password/:token — проверить, что ссылка ещё валидна
  app.get('/reset-password/:token', {
    schema: {
      tags: ['Auth'],
      summary: 'Validate a password reset token',
      params: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } },
    },
  }, async (request, reply) => {
    const { token } = request.params as { token: string }
    const tokenHash = hashRefreshToken(token)
    const record = await app.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { username: true, nickname: true } } },
    })
    const valid = !!record && !record.consumedAt && record.expiresAt >= new Date()
    if (!valid) {
      return reply.send({ data: { valid: false, user: null } })
    }
    return reply.send({ data: { valid: true, user: record!.user } })
  })

  // POST /auth/reset-password — самостоятельная смена пароля по токену из ссылки
  app.post('/reset-password', {
    config: {
      rateLimit: {
        max: env.RATE_LIMIT_LOGIN_MAX,
        timeWindow: env.RATE_LIMIT_LOGIN_WINDOW_MS,
      },
    },
    schema: {
      tags: ['Auth'],
      summary: 'Reset password using a token from the reset link',
      body: {
        type: 'object',
        required: ['token', 'password'],
        properties: {
          token: { type: 'string' },
          password: { type: 'string', minLength: 8, maxLength: 128 },
        },
      },
    },
  }, async (request, reply) => {
    const body = resetPasswordSchema.parse(request.body)
    await AuthService.resetPasswordWithToken(app.prisma, app.redis, body.token, body.password)
    return reply.code(204).send()
  })

  // POST /auth/change-password — смена пароля из настроек (нужен текущий пароль)
  app.post('/change-password', {
    preHandler: [authenticate],
    config: {
      rateLimit: {
        max: env.RATE_LIMIT_LOGIN_MAX,
        timeWindow: env.RATE_LIMIT_LOGIN_WINDOW_MS,
      },
    },
    schema: {
      tags: ['Auth'],
      summary: 'Change password (requires current password)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string' },
          newPassword: { type: 'string', minLength: 8, maxLength: 128 },
        },
      },
    },
  }, async (request, reply) => {
    const body = changePasswordSchema.parse(request.body)
    await AuthService.changePassword(
      app.prisma,
      app.redis,
      BigInt(request.user.sub),
      request.user.sessionId,
      body.currentPassword,
      body.newPassword,
    )
    return reply.code(204).send()
  })

  // POST /auth/logout
  app.post('/logout', {
    preHandler: [authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Logout current session',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    await AuthService.logout(app.prisma, app.redis, request.user.sessionId)
    return reply.code(204).send()
  })
}

export default authRoutes

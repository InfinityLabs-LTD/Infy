import fp from 'fastify-plugin'
import { FastifyPluginAsync } from 'fastify'
import * as Minio from 'minio'
import { env } from '../lib/env.js'

declare module 'fastify' {
  interface FastifyInstance {
    minio: Minio.Client
  }
}

const minioPlugin: FastifyPluginAsync = fp(async (app) => {
  const client = new Minio.Client({
    endPoint: env.MINIO_ENDPOINT,
    port: env.MINIO_PORT,
    useSSL: env.MINIO_USE_SSL,
    accessKey: env.MINIO_ROOT_USER,
    secretKey: env.MINIO_ROOT_PASSWORD,
  })

  // Ensure buckets exist
  for (const bucket of [env.MINIO_BUCKET_AVATARS, env.MINIO_BUCKET_MEDIA]) {
    const exists = await client.bucketExists(bucket)
    if (!exists) {
      await client.makeBucket(bucket)
      app.log.info(`Created MinIO bucket: ${bucket}`)
    }
  }

  app.decorate('minio', client)
})

export default minioPlugin

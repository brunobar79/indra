import * as cors from 'cors'
import * as express from 'express'
import https from 'https'
import selfsigned from 'selfsigned'

import { ApiService } from './api/ApiService'
import Config from './Config'
import { Container } from './Container'
import { getAuthMiddleware } from './middleware/AuthMiddleware'
import { ezPromise, maybe, MaybeRes } from './util'
import log from './util/log'


const LOG = log('ApiServer')

const requestLog = log('requests')
const requestLogMiddleware = (
  req: express.Request,
  res: express.Response,
  next: () => any,
): void => {
  const startTime = Date.now()
  res.on('finish', () => {
    const remoteAddr =
      req.ip || req.headers['x-forwarded-for'] || (req as any).address
    const duration = Date.now() - startTime
    requestLog.info(
      '{remoteAddr} {method} {url} {inSize} -> {statusCode} ({outSize}; {duration})',
      {
        duration: `${(duration / 1000).toFixed(3)} ms`,
        inSize: `${req.get('content-length') || '0'} bytes`,
        method: req.method,
        outSize: `${res.get('content-length') || '?'} bytes`,
        remoteAddr,
        statusCode: res.statusCode,
        url: req.originalUrl,
      },
    )
  })
  next()
}

/**
 * Adds `getText(): Promise<string>` and `getRawBody(): Promise<Buffer>`
 * methods to `req`. They will reject if no content-length is provided,
 * or the content-length > maxSize.
 */
function bodyTextMiddleware(opts: { maxSize: number }): any {
  return (
    req: express.Request,
    res: express.Response,
    next: () => any,
  ): any => {
    const rawPromise = ezPromise<MaybeRes<Buffer>>()
    const textPromise = ezPromise<MaybeRes<string>>()

    req.getRawBody = (): any => maybe.unwrap(rawPromise.promise)
    req.getText = (): any => maybe.unwrap(textPromise.promise)

    const size = +req.headers['content-length']
    if (size > opts.maxSize) {
      const msg =
        size > opts.maxSize
          ? `bodyTextMiddleware: body too large (${size} > ${
              opts.maxSize
            }); not parsing.`
          : `bodyTextMiddleware: no content-length; not parsing body.`
      LOG.debug(msg)
      const rej = maybe.reject(new Error(msg))
      rawPromise.resolve(rej as any)
      textPromise.resolve(rej as any)
      return next()
    }

    const rawData = Buffer.alloc(size)
    let offset = 0
    req.on('data', (chunk: Buffer) => {
      LOG.debug(`Data! max size: ${opts.maxSize}`)
      chunk.copy(rawData, offset)
      offset += chunk.length
    })
    req.on('end', () => {
      // Assume UTF-8 because there's no easy way to get the correct charset ¯\_(ツ)_/¯
      rawPromise.resolve(maybe.accept(rawData))
      textPromise.resolve(maybe.accept(rawData.toString('utf8')))
    })
    return next()
  }
}

const logErrors = (
  err: any,
  req: express.Request,
  res: express.Response,
  next: any,
): void => {
  if (res.headersSent) {
    return next(err)
  }
  res.status(500)
  res.json({
    error: true,
    msg: err.message,
    reason: 'Unknown Error',
    stack: err.stack,
  })
  LOG.error('Unknown error in {req.method} {req.path}: {message}', {
    message: err.message,
    req: {
      body: req.body,
      method: req.method,
      path: req.path,
      query: req.query,
    },
    stack: err.stack,
  })
}

export class ApiServer {
  public app: express.Application
  private readonly config: Config
  private readonly apiServices: ApiService[]

  public constructor(protected readonly container: Container) {
    this.config = container.resolve('Config')
    const corsHandler = cors({ credentials: true, origin: true })
    const apiServiceClasses = container.resolve('ApiServerServices') as any[]
    this.apiServices = apiServiceClasses.map(
      (cls: any): any => new cls(this.container),
    )

    this.app = express()
    this.app.options('*', corsHandler)

    // Start constructing API pipeline
    this.app.use(requestLogMiddleware)
    this.app.use(corsHandler)
    this.app.use(getAuthMiddleware(this.config))
    this.app.use(express.json())
    this.app.use(bodyTextMiddleware({ maxSize: 1024 * 1024 * 10 }))
    this.app.use(express.urlencoded({ extended: false }))
    this.app.use(logErrors.bind(this))
    this.apiServices.forEach(
      (s: any): any => {
        LOG.info(`Setting up API service at /${s.namespace}`)
        this.app.use(`/${s.namespace}`, s.getRouter())
      },
    )
    // Done constructing API pipeline
  }

  public async start(): Promise<void> {
    if (this.config.forceSsl) {
      const attrs = [{ name: 'commonName', value: 'localhost' }]
      const pems = selfsigned.generate(attrs, { days: 365, keySize: 4096 })
      return new Promise((resolve: any): any => {
        const callback: any = (err: any): void => {
          if (err) throw err
          LOG.info(`Listening on SSL port ${this.config.httpsPort}.`)
          resolve()
        }
        https
          .createServer({ key: pems.private, cert: pems.cert }, this.app)
          .listen(this.config.httpsPort, callback)
      })
    }
    return new Promise((resolve: any): void => {
      this.app.listen(this.config.port, () => {
        LOG.info(`Listening on port ${this.config.port}.`)
        resolve()
      })
    })
  }
}

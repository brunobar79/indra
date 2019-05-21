import * as connectRedis from 'connect-redis'
import * as cors from 'cors'
import * as express from 'express'
import * as session from 'express-session'

import { ApiService } from './api/ApiService'
import Config from './Config'
import { Container } from './Container'
import { default as AuthHandler } from './middleware/AuthHandler'
import AuthHeaderMiddleware from './middleware/AuthHeaderMiddleware'
import { ezPromise, maybe, MaybeRes } from './util'
import log from './util/log'

const LOG = log('ApiServer')
const SESSION_LOG = log('ConnectRedis')

const RedisStore = connectRedis(session)

const requestLog = log('requests')
const requestLogMiddleware = (
  req: express.Request,
  res: express.Response,
  next: () => any
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
        url: req.originalUrl
      }
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
    next: () => any
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

export class ApiServer {
  public app: express.Application

  private readonly config: Config
  private readonly authHandler: AuthHandler
  private readonly apiServices: ApiService[]

  public constructor(protected readonly container: Container) {
    this.config = container.resolve('Config')
    this.authHandler = this.container.resolve('AuthHandler')

    this.app = express()
    this.app.use(requestLogMiddleware)

    const corsHandler = cors({
      credentials: true,
      origin: true
    })
    this.app.options('*', corsHandler)
    this.app.use(corsHandler)

    this.app.use(express.json())
    this.app.use(new AuthHeaderMiddleware().middleware)

    // TODO: remove session completely
    // this.app.use(
    //   session({
    //     secret: this.config.sessionSecret,
    //     name: COOKIE_NAME,
    //     resave: false,
    //     store: new RedisStore({
    //       url: this.config.redisUrl,
    //       logErrors: (err: any) =>
    //         SESSION_LOG.error('Encountered error in Redis session: {err}', {
    //           err
    //         })
    //     }),
    //     cookie: {
    //       httpOnly: true
    //     }
    //   })
    // )

    // Note: this needs to come before the `express.json()` middlware, but
    // after the session middleware. I have no idea why, but if it's before the
    // session middleware requests hang, and the `express.json()` middleware
    // reads and exhausts the body, so we can't go after that one.
    this.app.use(bodyTextMiddleware({ maxSize: 1024 * 1024 * 10 }))

    this.app.use(express.urlencoded())

    this.app.use(this.authenticateRoutes.bind(this))
    this.app.use(this.logErrors.bind(this))

    const apiServiceClasses = container.resolve('ApiServerServices') as any[]
    this.apiServices = apiServiceClasses.map(cls => new cls(this.container))
    this.setupRoutes()
  }

  public async start(): Promise<any> {
    return new Promise(resolve =>
      this.app.listen(this.config.port, () => {
        LOG.info(`Listening on port ${this.config.port}.`)
        resolve()
      })
    )
  }

  private setupRoutes() {
    this.apiServices.forEach(s => {
      LOG.info(`Setting up API service at /${s.namespace}`)
      this.app.use(`/${s.namespace}`, s.getRouter())
    })
  }

  protected async authenticateRoutes(
    req: express.Request,
    res: express.Response,
    next: () => void
  ) {
    const roles = await this.authHandler.rolesFor(req)
    req.session!.roles = new Set(roles)
    const allowed = await this.authHandler.isAuthorized(req)

    if (!allowed) {
      return res.sendStatus(403)
    }

    next()
  }

  private logErrors(
    err: any,
    req: express.Request,
    res: express.Response,
    next: any
  ) {
    if (res.headersSent) {
      return next(err)
    }

    res.status(500)
    res.json({
      error: true,
      reason: 'Unknown Error',
      msg: err.message,
      stack: err.stack
    })

    LOG.error('Unknown error in {req.method} {req.path}: {message}', {
      message: err.message,
      stack: err.stack,
      req: {
        method: req.method,
        path: req.path,
        query: req.query,
        body: req.body
      }
    })
  }
}

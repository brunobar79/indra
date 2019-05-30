import * as WebSocket from 'ws'

import Config from './Config'
import { Logger } from './util'

export class SubscriptionServer {
  private config: Config
  private log: Logger
  public server: WebSocket.Server

  public constructor(config: Config) {
    this.log = new Logger('SubscriptionServer', config.logLevel)

    this.server = new WebSocket.Server({ port: config.port + 1 })

    this.server.on('connection', (ws: WebSocket, req: any): void => {
      this.log.info(`New WebSocket connection established with: ${
        req.headers['x-forwarded-for'].split(/\s*,\s*/)[0] || req.connection.remoteAddress
      }`)

      // The client shouldn't need to write to the subscription ws endpoint
      // But we'll log anything that's written just in case
      ws.on('message', (message: string): void => {
        if (message.length > 0) {
          this.log.info(`WebSocket received message: ${message}`)
        }
      })
    })
  }

  public broadcast(data: string): void {
    this.log.info(`Broadcasting: ${data}`)
    this.server.clients.forEach((client: WebSocket): void => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data)
      }
    })
  }

}

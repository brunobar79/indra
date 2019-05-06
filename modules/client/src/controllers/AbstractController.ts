import { ConnextInstance } from "../Connext";
import { IHubAPIClient } from "../Hub";
import Logger from '../lib/Logger'
import { ConnextState, ConnextStore } from "../state/store";
import { Validator } from '../validator';

export abstract class AbstractController {
  name: string
  connext: ConnextInstance
  logger: Logger
  hub: IHubAPIClient
  validator: Validator

  constructor(name: string, connext: ConnextInstance) {
    this.connext = connext
    this.name = name
    this.logger = connext.getLogger(this.name)
    this.hub = connext.hub
    this.validator = connext.validator
  }

  get store(): ConnextStore {
    return this.connext.store
  }

  getState(): ConnextState {
    return this.connext.store.getState()
  }

  async start(): Promise<void> { }
  async stop(): Promise<void> { }

  protected logToApi(key: string, data: any) {
    this.logger.logToApi(key, data)
  }
}

import * as connext from 'connext'
import { ChannelManagerChannelDetails } from 'connext/types'
import { ethers as eth } from 'ethers'
import * as request from 'supertest'
const Web3 = require('web3')

import { default as ChannelManagerABI } from '../abi/ChannelManager'
import { ApiServer } from '../ApiServer'
import Config from '../Config'
import { Container } from '../Container'
import { PgPoolService } from '../DBEngine'
import { getRedisClient } from '../RedisClient'
import { Role } from '../Role'
import { serviceDefinitions } from '../services'
import { SignerService } from '../SignerService'

import { truncateAllTables } from './eraseDb'
import { mkAddress, mkHash, mkSig } from './stateUtils'

const serviceKey = 'unspank-the-unbanked'
const mnemonic = 'candy maple cake sugar pudding cream honey rich smooth crumble sweet treat'
const databaseUrl = process.env.DATABASE_URL_TEST || 'postgres://127.0.0.1:5432'
const redisUrl = process.env.REDIS_URL_TEST || 'redis://127.0.0.1:6379/6'
const providerUrl = process.env.ETH_RPC_URL_TEST || 'http://127.0.0.1:8545'

console.log(`\nTest urls:\n - db: ${databaseUrl}\n - redis: ${redisUrl}\n - eth: ${providerUrl}`)
// console.log(`\nTest env:\n${JSON.stringify(process.env,null,2)}`)

export const testChannelManagerAddress = mkAddress('0xCCC')
export const testHotWalletAddress = '0x7776900000000000000000000000000000000000'
export const getTestConfig = (overrides?: any) => ({
  ...Config.fromEnv(),
  adminAddresses: [ testHotWalletAddress ],
  databaseUrl,
  redisUrl,
  serviceKey,
  sessionSecret: 'hummus',
  hotWalletAddress: testHotWalletAddress,
  channelManagerAddress: testChannelManagerAddress,
  staleChannelDays: 1,
  ...(overrides || {}),
})

export class PgPoolServiceForTest extends PgPoolService {
  testNeedsReset = true

  async clearDatabase() {
    const cxn = await this.pool.connect()
    try {
      if (this.testNeedsReset) {
        await truncateAllTables(cxn as any)
      }
    } finally {
      cxn.release()
    }
  }
}

export class TestApiServer extends ApiServer {
  public constructor(container: Container) {
    super(container)
    this.request = request(this.app)
  }

  public request: request.SuperTest<request.Test>

  public withUser(address?: string): TestApiServer {
    return this.container.resolve('TestApiServer')
  }

  public withAdmin(address?: string): TestApiServer {
    return this.container.resolve('TestApiServer')
  }
}

// NOTE: This is a work in progress
class MockWeb3Provider {
  countId = 1

  _getResponse(result) {
    return {
      jsonrpc: '2.0',
      id: this.countId,
      result,
    }
  }

  _getError(msg) {
    return {
      jsonrpc: '2.0',
      id: this.countId,
      error: {
        code: 1234,
        message: msg,
      }
    }
  }

  send(payload) {
    throw new Error('sync send not supported')
  }

  sendAsync(payload, callback) {
    if (payload.id)
      this.countId = payload.id

    console.log('SEND ASYNC:', payload)
  }

  on(type, callback) {
    throw new Error('uh oh: ' + type)
  }
}

class MockValidator extends connext.Validator {
  constructor() {
    super('0xfoobar', {} as any, ChannelManagerABI.abi)
  }

  assertChannelSigner() {
    return null
  }

  assertThreadSigner() {
    return null
  }

  assertDepositRequestSigner(req: any) {
    if (!req.sigUser) {
      throw new Error('No signature detected')
    }
    return null
  }
}

export class MockGasEstimateDao {
  async latest() {
    return {
      retrievedAt: Date.now(),
      speed: 1,
      blockNum: 1,
      blockTime: 15,

      fastest: 9,
      fastestWait: 9.9,

      fast: 6,
      fastWait: 6.6,

      average: 4,
      avgWait: 4.4,

      safeLow: 2,
      safeLowWait: 2.2,
    }
  }
}

export const mockRate = '123.45'
export class MockExchangeRateDao {
  async latest() {
    return {
      retrievedAt: Date.now(),
      rates: {
        DAI: mockRate
      }
    }
  }

  async getLatestDaiRate() {
    return mockRate
  }

  async getDaiRateAtTime(date: Date) {
    return mockRate
  }
}

export const fakeSig = mkSig('0xabc123')
export class MockSignerService extends SignerService {
  async getSigForChannelState() {
    return fakeSig
  }

  async getChannelDetails() {
    return {
      channelClosingTime: fakeClosingTime,
      exitInitiator: '',
      status: '',
      threadCount: 0,
      threadRoot: '',
      txCountChain: 1,
      txCountGlobal: 1
    } as ChannelManagerChannelDetails
  }
}

export const getMockWeb3 = () => {
  const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'))
  return {
    ...web3,
    eth: {
      ...web3.eth,
      getBlock: async (block: string | number) => {
        if (block === 'latest') {
          return { timestamp: Math.floor(Date.now() / 1000) }
        }
      },
      sign: async () => {
        return
      },
      getTransactionCount: async () => {
        return 1
      },
      estimateGas: async () => {
        return 1000
      },
      signTransaction: async () => {
        return {
          tx: {
            hash: mkHash('0xaaa'),
            r: mkHash('0xabc'),
            s: mkHash('0xdef'),
            v: '0x27',
          },
        }
      },
      sendSignedTransaction: () => {
        console.log(`Called mocked web3 function sendSignedTransaction`)
        return {
          on: (input, cb) => {
            switch (input) {
              case 'transactionHash':
                return cb(mkHash('0xbeef'))
              case 'error':
                return cb(null)
            }
          },
        }
      },
      sendTransaction: () => {
        console.log(`Called mocked web3 function sendTransaction`)
        return {
          on: (input, cb) => {
            switch (input) {
              case 'transactionHash':
                return cb(mkHash('0xbeef'))
              case 'error':
                return cb(null)
            }
          },
        }
      },
    },
  }
}

export let fakeClosingTime: number = 0
export function setFakeClosingTime(time: number) {
  fakeClosingTime = time
}
export function clearFakeClosingTime() {
  fakeClosingTime = 0
}

export class MockChannelManagerContract {
  methods = {
    hubAuthorizedUpdate: () => {
      return {
        send: async () => {
          console.log(`Called mocked contract function hubAuthorizedUpdate`)
          return true
        },
        encodeABI: () => {
          console.log(`Called mocked contract function hubAuthorizedUpdate`)
          return true
        },
      }
    },
    getChannelDetails: () => {
      console.log(`Called mocked contract function getChannelDetails`)
      return {
        call: async () => {
          return [
            1, // txCountGlobal
            1, // txCountChain
            '', // threadRoot 
            0, // threadCount
            '', // exitInitiator 
            fakeClosingTime, // channelClosingTime
            '' // status
          ]
        }
      }
    },
    startExitWithUpdate: () => {
      console.log(`Called mocked contract function startExitWithUpdate`)
      return {
        send: async () => {
          return true
        },
        encodeABI: () => {
          return '0xdeadbeef'
        },
      }
    },
    startExit: () => {
      console.log(`Called mocked contract function startExit`)
      return {
        send: async () => {
          return true
        },
        encodeABI: () => {
          return '0xdeadbeef'
        },
      }
    },
    emptyChannel: () => {
      console.log(`Called mocked contract function emptyChannel`)
      return {
        send: async () => {
          return true
        },
        encodeABI: () => {
          return '0xdeadbeef'
        },
      }
    },
    challengePeriod: () => {
      return {
        call: async () => {
          return 0
        }
      }
    }
  }
}

export const mockServices: any = {
  'Config': {
    factory: getTestConfig,
  },

  'RedisClient': {
    factory: (config: any) => {
      const client = getRedisClient(config.redisUrl)
      client.flushall()
      return client
    },
    dependencies: ['Config'],
    isSingleton: true
  },

  'PgPoolService': {
    factory: (config: any) => new PgPoolServiceForTest(config),
    dependencies: ['Config'],
    isSingleton: true,
  },

  'TestApiServer': {
    factory: (container: Container) => new TestApiServer(container),
    dependencies: ['Container'],
  },

  'Web3': {
    factory: () => new Web3(new Web3.providers.HttpProvider(providerUrl)),
    dependencies: []
  },

  'Validator': {
    factory: () => new MockValidator(),
  },

  'ExchangeRateDao': {
    factory: () => new MockExchangeRateDao(),
  },

  'GasEstimateDao': {
    factory: () => new MockGasEstimateDao(),
  },

  'SignerService': {
    ...serviceDefinitions['SignerService'],
    // @ts-ignore
    factory: (...args: any[]) => new MockSignerService(...args),
  },

  'ChannelManagerContract': {
    factory: () => new MockChannelManagerContract(),
  },
}

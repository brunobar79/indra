import camelize from './util/camelize'
import { Registry } from './Container'
import { big } from 'connext';
const {
  Big,
  toWeiBig,
  toWeiString,
} = big

const ENV_VARS = [
  'ETH_RPC_URL',
  'ETH_NETWORK_ID',
  'DATABASE_URL',
  'CHANNEL_MANAGER_ADDRESS',
  'AUTH_REALM',
  'AUTH_DOMAIN_WHITELIST',
  'PORT',
  'SHOULD_COLLATERALIZE_URL',
  'MIN_SETTLEMENT_PERIOD',
  'RECIPIENT_WHITELIST',
  'SESSION_SECRET',
  'CARD_NAME',
  'CARD_IMAGE_URL',
  // 'REALTIME_DB_SECRET',
  'SERVICE_USER_KEY',
  'REDIS_URL',
  'TOKEN_CONTRACT_ADDRESS',
  'HOT_WALLET_ADDRESS',
  'HUB_PUBLIC_URL',
  'COINPAYMENTS_MERCHANT_ID',
  'COINPAYMENTS_API_KEY',
  'COINPAYMENTS_API_SECRET',
  'COINPAYMENTS_IPN_SECRET',
  'PRIVATE_KEY_FILE'
]

const env = process.env.NODE_ENV || 'development'
function envswitch(vals: any) {
  let res = vals[env]
  if (res === undefined)
    throw new Error(`No valid specified for env '${env}' in ${JSON.stringify(vals)}`)
  return res
}

export interface BrandingConfig {
  title?: string
  companyName?: string
  backgroundColor?: string
  textColor?: string
}

export default class Config {
  static fromEnv(overrides?: Partial<Config>): Config {
    const instance = new Config()

    // prettier-ignore
    ENV_VARS.forEach((v: string) => {
      const val: any = process.env[v]
      if (val !== undefined)
        (instance as any)[camelize(v, '_')] = v.endsWith('ADDRESS') ? val.toLowerCase() : val
    })

    for (let key in (overrides || {}))
      instance[key] = overrides[key]

    return instance
  }

  public isProduction = env == 'production'
  public isStage = env == 'staging'
  public isDev = env == 'development'
  public ethRpcUrl: string = ''
  public ethNetworkId: string = ''
  public databaseUrl: string = ''
  public redisUrl: string = ''
  public channelManagerAddress: string = ''
  public authRealm: string = ''
  public authDomainWhitelist: string[] = []
  public adminAddresses?: string[] = []
  public serviceUserKey: string = 'omqGMZzn90vFJskXFxzuO3gYHM6M989spw99f3ngRSiNSOUdB0PmmYTvZMByUKD'
  public port: number = 8080
  // URL used to check whether a user should receive collateral.
  // Called by ChannelsService.shouldCollateralize:
  //
  //   GET `${shouldCollateralizeUrl}/${user}`
  //
  // And is expected to return:
  //
  //   { shouldCollateralize: true | false }
  //
  // If the value is 'NO_CHECK' then no check will be performed.
  public shouldCollateralizeUrl: string | 'NO_CHECK' = 'NO_CHECK'
  public recipientAddress: string = ''
  public hotWalletAddress: string = ''
  public hotWalletMinBalance: string = toWeiString('6.9')
  public sessionSecret: string = ''
  public staleChannelDays?: number = process.env.STALE_CHANNEL_DAYS ? parseInt(process.env.STALE_CHANNEL_DAYS) : null // if null, will not dispute
  public registry?: Registry
  public branding: BrandingConfig
  public tokenContractAddress: string = ''
  // amount users can have in any one channel for their balance
  public channelBeiLimit = toWeiBig(process.env.CHANNEL_BEI_LIMIT || 69)
  // minimum amount of bei the hub will put into any one channel
  // for collateral
  public beiMinCollateralization = toWeiBig(process.env.BEI_MIN_COLLATERALIZATION || 10)
  // max bei the hub will collateralize at any point
  public beiMaxCollateralization = toWeiBig(process.env.BEI_MAX_COLLATERALIZATION || 169)
  public recentPaymentsInterval  = (process.env.RECENT_PAYMENTS_INTERVAL || '10 minutes')

  public threadBeiLimit = toWeiBig(process.env.THREAD_BEI_LIMIT || 10)
  public channelBeiDeposit = this.channelBeiLimit.add(Big(1069))
  
  public privateKeyFile: string = ''

  public hubPublicUrl = envswitch({
    development: null, // will be generated by NgrokService
    staging: 'https://hub-staging.spankdev.com',
    production: 'https://hub.spankchain.com',
  })

  public coinpaymentsMerchantId = envswitch({
    development: '898d6ead05235f6081e97a58a6699289',
    staging: '898d6ead05235f6081e97a58a6699289',
    production: 'set by environment variable',
  })

  public coinpaymentsApiKey = envswitch({
    development: '62eceb03e8fcb4f8ebdc1b8f43e1e6f4b9b120f0856061d228cf04b01ed5cf08',
    staging: '62eceb03e8fcb4f8ebdc1b8f43e1e6f4b9b120f0856061d228cf04b01ed5cf08',
    production: 'set by environment variable',
  })

  public coinpaymentsApiSecret = envswitch({
    development: 'A78Dba053693985Fa8F9aad010352caa61a6e2ECb7E20E87AcfABc7ee37C3005',
    staging: 'A78Dba053693985Fa8F9aad010352caa61a6e2ECb7E20E87AcfABc7ee37C3005',
    production: 'set by environment variable',
  })

  public coinpaymentsIpnSecret = envswitch({
    development: 'U1BC9v1s3l0zxdH3',
    staging: 'U1BC9v1s3l0zxdH3',
    production: 'set by environment variable',
  })
}

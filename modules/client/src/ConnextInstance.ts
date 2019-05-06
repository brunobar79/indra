import { ConnextState } from "./state/store";
import {
  ChannelState,
  ExchangeRates,
  UpdateArgTypes,
  NumericTypeName,
  ChannelStateBN,
  ChannelRow,
  ChannelRowBN,
  ChannelStateUpdateRow,
  ChannelStateUpdateRowBN,
  DepositArgs,
  ThreadState,
  ThreadStateBN,
  ExchangeArgs,
  PaymentArgs,
  Payment,
  WithdrawalArgs,
  NumericTypes,
  WithdrawalParameters,
  channelNumericFields,
  convertArgs,
  convertChannelRow,
  convertChannelStateUpdateRow,
  convertChannelState,
  convertThreadState,
  convertDeposit,
  convertExchange,
  convertPayment,
  convertWithdrawal,
  convertWithdrawalParameters,
  convertFields
} from "./types";
import { BigNumber as BN } from "ethers/utils";
import { ConnextClient, getConnextClient } from "./Connext";
import {
  assetToWei,
  maxBN,
  minBN,
  toWeiBig,
  toWeiString,
  weiToAsset
} from "./lib/bn";
import { Utils } from "./Utils";
import Logger from "./lib/Logger";
import Wallet from "./Wallet";
import Web3 from "web3";
import { Networking } from "./helpers/networking";

// connext instances contain the lower level types and fields you would need
// to be used by various clients that can be "connected" to an instance

type Reason = keyof UpdateArgTypes;

// TODO: import the connext provider
export type ConnextProvider = any

export interface ConnextOptions {
  mnemonic?: string
  privateKey?: string
  password?: string
  address?: string
  web3?: Web3 // TODO: update wallet to work with Web3EtherProvider
  connextProvider?: ConnextProvider
  safeSignHook?: (state: ChannelState | ThreadState) => Promise<string>
  loadState?: () => Promise<string | null>
  saveState?: (state: string) => Promise<any>
}

export interface IConnextInstance {
  utils: {
    channelNumericFields: string[];
    assetToWei(asset: BN, exchangeRate: string): [BN, BN];
    createChannelStateHash(channelState: ChannelState): string;
    generateSecret(): string;
    getExchangeRates(store: ConnextState): ExchangeRates;
    hasPendingOps(state: ChannelState<any>): boolean;
    maxBN(a: BN, b: BN): BN;
    minBN(a: BN, b: BN): BN;
    toWeiBig(value: number | string | BN): BN;
    toWeiString(value: number | string | BN): string;
    weiToAsset(wei: BN, exchangeRate: string): BN;
  };

  convert: {
    // TODO: funky ts...?
    args(
      to: NumericTypeName,
      reason: Reason,
      args: UpdateArgTypes[Reason]
    ): UpdateArgTypes<NumericTypeName>[Reason];

    channelRow(
      to: NumericTypeName,
      state: ChannelRow<any>
    ): ChannelRow | ChannelRowBN;
    channelStateUpdateRow(
      to: NumericTypeName,
      state: ChannelStateUpdateRow<any>
    ): ChannelStateUpdateRow | ChannelStateUpdateRowBN;

    channelState(
      to: NumericTypeName,
      state: ChannelState<any>
    ): ChannelState | ChannelStateBN;
    threadState(
      to: NumericTypeName,
      state: ThreadState<any>
    ): ThreadState | ThreadStateBN;

    deposit(
      to: NumericTypeName,
      args: DepositArgs<any>
    ): DepositArgs<NumericTypes[NumericTypeName]>;
    exchange(
      to: NumericTypeName,
      args: ExchangeArgs<any>
    ): ExchangeArgs<NumericTypes[NumericTypeName]>;
    payment(
      to: NumericTypeName,
      args: PaymentArgs<any> | Payment<any>
    ):
      | PaymentArgs<NumericTypes[NumericTypeName]>
      | Payment<NumericTypes[NumericTypeName]>;
    withdrawal(
      to: NumericTypeName,
      args: WithdrawalArgs<any>
    ): WithdrawalArgs<NumericTypes[NumericTypeName]>;
    withdrawalParameters(
      to: NumericTypeName,
      args: WithdrawalParameters<any>
    ): WithdrawalParameters<NumericTypes[NumericTypeName]>;

    fields(
      to: NumericTypeName,
      from: NumericTypeName,
      fields: string[],
      object: any
    ): any;
  };

  connect(hubUrl: string): Promise<ConnextClient>;
  // disconnect(hubUrl: string): Promise<void>;

  wallet: Wallet
}

// TODO: rename this class to Connext?
export class ConnextInstance implements IConnextInstance {
  public wallet: Wallet
  // TODO: remove reference to the client here
  public client?: ConnextClient
  private opts: ConnextOptions
  private stateUtils = new Utils();

  constructor(opts: ConnextOptions) {
    this.opts = opts

    this.wallet = new Wallet(opts)
  }

  public utils = {
    channelNumericFields,
    createChannelStateHash: this.stateUtils.createChannelStateHash,
    generateSecret: this.stateUtils.generateSecret,
    getExchangeRates: this.stateUtils.getters.getExchangeRates,
    hasPendingOps: this.stateUtils.hasPendingOps,
    maxBN,
    minBN,
    toWeiBig,
    toWeiString,
    weiToAsset,
    assetToWei
  };

  public convert = {
    args: convertArgs,
    channelRow: convertChannelRow,
    channelStateUpdateRow: convertChannelStateUpdateRow,
    channelState: convertChannelState,
    threadState: convertThreadState,
    deposit: convertDeposit,
    exchange: convertExchange,
    payment: convertPayment,
    withdrawal: convertWithdrawal,
    withdrawalParameters: convertWithdrawalParameters,
    fields: convertFields
  };

  public async connect(hubUrl: string): Promise<ConnextClient> {
    if (this.client) {
      throw new Error("Connected client detected, please call connext.disconnect()")
    }
    // start all of the controllers and connect the
    // ConnextInstance class with an active client-hub pair
    const hubConfig = (await (new Networking(hubUrl)).get(`config`)).data
    const config = {
      contractAddress: hubConfig.channelManagerAddress.toLowerCase(),
      hubAddress: hubConfig.hubWalletAddress.toLowerCase(),
      tokenAddress: hubConfig.tokenAddress.toLowerCase(),
      ethNetworkId: hubConfig.ethNetworkId.toLowerCase(),
    }

    const client = new ConnextClient({
      hubUrl,
      ...config
    }, this.wallet)
    await client.connect()
    return client
  }

}

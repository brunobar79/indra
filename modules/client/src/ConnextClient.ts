import { IHubAPIClient, HubAPIClient } from "./Hub";
import { ConnextStore, ConnextState, PersistentState } from "./state/store";
import { IChannelManager, ChannelManager } from "./contract/ChannelManager";
import { StateGenerator } from "./StateGenerator";
import { Validator } from "./validator";
import { Utils } from "./Utils";
import { ConnextInstance } from "./ConnextInstance";
import { Payment, PartialPurchaseRequest, WithdrawalParameters, SuccinctWithdrawalParameters, PaymentProfileConfig, PurchaseRowWithPayments, convertChannelState, convertPayment, insertDefault, argNumericFields, ChannelState, UnsignedChannelState, addSigToChannelState, UnsignedThreadState, ThreadState, addSigToThreadState, Omit, SignedDepositRequestProposal } from "./types";
import { EventEmitter } from "events";
import { RedeemController } from "./controllers/RedeemController";
import ThreadsController from "./controllers/ThreadsController";
import CollateralController from "./controllers/CollateralController";
import StateUpdateController from "./controllers/StateUpdateController";
import WithdrawalController from "./controllers/WithdrawalController";
import { ExchangeController } from "./controllers/ExchangeController";
import DepositController from "./controllers/DepositController";
import BuyController from "./controllers/BuyController";
import SyncController from "./controllers/SyncController";
import Wallet from "./Wallet";
import { AbstractController } from "./controllers/AbstractController";
import { isFunction } from "util";
import { Networking } from "./helpers/networking";
import * as actions from './state/actions';
import { timeoutPromise } from "./lib/utils";
import Logger from "./lib/Logger";
import { createStore, applyMiddleware } from "redux";

////////////////////////////////////////
// Interface Definitions
////////////////////////////////////////

export interface ClientOptions {
  hubUrl: string,
  
  // these can all be retrieved from a sync endpoint url on the hub
  contractAddress: string,
  hubAddress: string,
  tokenAddress: string,
  ethNetworkId: string,

  // dont need to provide, but can
  gasMultiple?: number // will default to 1.5
  origin?: string // TODO: remove, defaults to unknown

  // Optional, useful for dependency injection + tests
  hub?: IHubAPIClient
  store?: ConnextStore
  contract?: IChannelManager
}

export interface IConnextClient extends EventEmitter {
  // static properties derived from the connected
  // hubs configuration
  contractAddress: string
  ethNetworkId: string
  hubAddress: string
  hubUrl: string
  tokenAddress: string

  // other convenience properties
  validator: Validator
  utils: Utils
  convert: ConnextInstance["convert"]

  // core channel management methods
  deposit(payment: Partial<Payment>): Promise<void>
  exchange(toSell: string, currency: "wei" | "token"): Promise<void>
  buy(purchase: PartialPurchaseRequest): Promise<{ purchaseId: string }>
  redeem(secret: string): Promise<{ purchaseId: string, amount: Payment }>
  withdraw(withdrawal: Partial<WithdrawalParameters> | SuccinctWithdrawalParameters): Promise<void>

  // collateral management
  requestCollateral(): Promise<void>
  recipientNeedsCollateral(payee: string, amount: Partial<Payment>): Promise<string | null>

  // state history
  getHistory(): Promise<PurchaseRowWithPayments[]>
  getHistoryById(id: string): Promise<PurchaseRowWithPayments>

  // payment profile methods
  getProfileConfig(): Promise<PaymentProfileConfig>
  startProfileSession(id: string): Promise<void>

  // other methods, useful for implementers
  setPollInterval(ms: number): Promise<void>

  // TODO: probably a different way to do this..
  connect(): Promise<ConnextClient>
}

export class ConnextClient extends EventEmitter implements IConnextClient {
  // private controllers
  private syncController: SyncController
  private buyController: BuyController
  private depositController: DepositController
  private exchangeController: ExchangeController
  private withdrawalController: WithdrawalController
  private stateUpdateController: StateUpdateController
  private collateralController: CollateralController
  private threadsController: ThreadsController
  private redeemController: RedeemController

  // private references
  private wallet: Wallet
  private hub: IHubAPIClient
  
  // public references
  public store: ConnextStore // created on connect
  public utils = new Utils()
  public validator: Validator

  // NOTE: because the contractAddress, hubAddress, etc.
  // is not included in the options, the channel manager
  // cannot be included at default, and must be included
  // in the connect method, where it can be async (to sync
  // hub config)
  public contract: IChannelManager // created on connect

  // hubs configuration
  contractAddress: string
  ethNetworkId: string
  hubAddress: string
  hubUrl: string
  tokenAddress: string

  constructor(opts: ClientOptions, wallet: Wallet) {
    super()
    // wallet and channel store
    this.store = opts.store || null as any // set def to non-null on connect
    this.wallet = wallet

    this.contractAddress = opts.contractAddress
    this.ethNetworkId = opts.ethNetworkId
    this.hubAddress = opts.hubAddress
    this.hubUrl = opts.hubUrl
    this.tokenAddress = opts.tokenAddress

    // channel manager
    this.contract = opts.contract || new ChannelManager(
      wallet,
      opts.contractAddress,
      opts.gasMultiple || 1.5
    )

    // hub class
    this.hub = opts.hub || new HubAPIClient(
      new Networking(opts.hubUrl),
      opts.origin || 'unknown',
      this.wallet,
    )

    // validator class
    this.validator = new Validator(
      opts.hubAddress, 
      wallet.provider, 
      this.contract.rawAbi
    )

    // Controllers
    this.exchangeController = new ExchangeController('ExchangeController', this)
    this.syncController = new SyncController('SyncController', this)
    this.depositController = new DepositController('DepositController', this)
    this.buyController = new BuyController('BuyController', this)
    this.withdrawalController = new WithdrawalController('WithdrawalController', this)
    this.stateUpdateController = new StateUpdateController('StateUpdateController', this)
    this.collateralController = new CollateralController('CollateralController', this)
    this.threadsController = new ThreadsController('ThreadsController', this)
    this.redeemController = new RedeemController('RedeemController', this)
  }

  // core channel management methods
  async deposit(payment: Partial<Payment>): Promise<void> {
    await this.depositController.requestUserDeposit(payment)
  }

  async exchange(toSell: string, currency: "wei" | "token"): Promise<void> {
    await this.exchangeController.exchange(toSell, currency)
  }

  async buy(purchase: PartialPurchaseRequest): Promise<{ purchaseId: string }> {
    return await this.buyController.buy(purchase)
  }

  async redeem(secret: string): Promise<{ purchaseId: string, amount: Payment }> {
    return await this.redeemController.redeem(secret)
  }

  async withdraw(withdrawal: Partial<WithdrawalParameters> | SuccinctWithdrawalParameters): Promise<void> {
    await this.withdrawalController.requestUserWithdrawal(withdrawal)
  }

  // collateral management
  async requestCollateral(): Promise<void> {
    await this.collateralController.requestCollateral()
  }

  async recipientNeedsCollateral(payee: string, amount: Partial<Payment>): Promise<string | null> {
    // get recipients channel
    let channel
    try {
      channel = await this.hub.getChannelByUser(payee)
    } catch (e) {
      if (e.status == 404) {
        return `Recipient channel does not exist. Recipient: ${payee}.`
      }
      throw e
    }

    // check if hub can afford payment
    const chanBN = convertChannelState("bn", channel.state)
    const amtBN = convertPayment("bn", 
      insertDefault('0', amount, argNumericFields.Payment)
    )
    if (chanBN.balanceWeiHub.lt(amtBN.amountWei) || chanBN.balanceTokenHub.lt(amtBN.amountToken)) {
      return `Recipient needs collateral to facilitate payment.`
    }
    // otherwise, no collateral is needed to make payment
    return null
  }

  // state history
  // TODO: functionality with PR
  async getHistory(): Promise<PurchaseRowWithPayments[]> {}
  async getHistoryById(id: string): Promise<PurchaseRowWithPayments> {}

  // payment profile methods
  // TODO: implement payment profiles
  async getProfileConfig(): Promise<PaymentProfileConfig> {}
  async startProfileSession(id: string): Promise<void> {}

  // other methods, useful for implementers
  // TODO: implement
  async setPollInterval(ms: number): Promise<void> {}

  async connect(): Promise<ConnextClient> {
    this.store = await this.getStore()
    this.store.subscribe(async () => {
      const state = this.store.getState()
      this.emit('onStateChange', state)
      await this._saveState(state)
    })

    // before starting controllers, sync values
    this.store.dispatch(actions.setHubAddress(this.hubAddress))


    // auth is handled on each endpoint posting via the Hub API Client

    // get any custodial balances
    const custodialBalance = await this.hub.getCustodialBalance()
    if (custodialBalance) {
      this.store.dispatch(actions.setCustodialBalance(custodialBalance))
    }

    // TODO: appropriately set the latest
    // valid state ??
    const channelAndUpdate = await this.hub.getLatestChannelStateAndUpdate()
    if (channelAndUpdate) {
      this.store.dispatch(actions.setChannelAndUpdate(channelAndUpdate))

      // update the latest valid state
      const latestValid = await this.hub.getLatestStateNoPendingOps()
      if (latestValid) {
        this.store.dispatch(actions.setLatestValidState(latestValid))
      }
      // unconditionally update last thread update id, thread history
      const lastThreadUpdateId = await this.hub.getLastThreadUpdateId()
      this.store.dispatch(actions.setLastThreadUpdateId(lastThreadUpdateId))
      // extract thread history, sort by descending threadId
      const threadHistoryDuplicates = (await this.hub.getAllThreads()).map(t => {
        return {
          sender: t.sender,
          receiver: t.receiver,
          threadId: t.threadId,
        }
      }).sort((a, b) => b.threadId - a.threadId)
      // filter duplicates
      const threadHistory = threadHistoryDuplicates.filter((thread, i) => {
        const search = JSON.stringify({
          sender: thread.sender,
          receiver: thread.receiver
        })
        const elts = threadHistoryDuplicates.map(t => {
          return JSON.stringify({ sender: t.sender, receiver: t.receiver })
        })
        return elts.indexOf(search) == i
      })
      this.store.dispatch(actions.setThreadHistory(threadHistory))

      // if thread count is greater than 0, update
      // activeThreads, initial states
      if (channelAndUpdate.state.threadCount > 0) {
        const initialStates = await this.hub.getThreadInitialStates()
        this.store.dispatch(actions.setActiveInitialThreadStates(initialStates))

        const threadRows = await this.hub.getActiveThreads()
        this.store.dispatch(actions.setActiveThreads(threadRows))
      }
    }

    // Start all controllers
    for (let controller of this.getControllers()) {
      console.log('Starting:', controller.name)
      await controller.start()
      console.log('Done!', controller.name, 'started.')
    }

    return this
  }

  async disconnect() {
    // Stop all controllers
    for (let controller of this.getControllers())
      await controller.stop()
  }

  async signChannelState(state: UnsignedChannelState): Promise<ChannelState> {
    if (
      state.user.toLowerCase() != this.wallet.address!.toLowerCase() ||
      state.contractAddress.toLowerCase()!= (this.contractAddress! as any).toLowerCase()
    ) {
      throw new Error(
        `Refusing to sign channel state update which changes user or contract: ` +
        `expected user: ${this.wallet.address}, expected contract: ${this.contractAddress} ` +
        `actual state: ${JSON.stringify(state)}`
      )
    }

    const hash = this.utils.createChannelStateHash(state)

    const sig = await this.wallet.signMessage(hash)

    console.log(`Signing channel state ${state.txCountGlobal}: ${sig}`, state)
    return addSigToChannelState(state, sig, true)
  }

  async signThreadState(state: UnsignedThreadState): Promise<ThreadState> {
    const userInThread = state.sender == this.wallet.address || state.receiver == this.wallet.address
    if (
      !userInThread ||
      state.contractAddress != this.contractAddress
    ) {
      throw new Error(
        `Refusing to sign thread state update which changes user or contract: ` +
        `expected user: ${this.wallet.address}, expected contract: ${this.contractAddress} ` +
        `actual state: ${JSON.stringify(state)}`
      )
    }

    const hash = this.utils.createThreadStateHash(state)

    const sig = await this.wallet.signMessage(hash)

    console.log(`Signing thread state ${state.txCount}: ${sig}`, state)
    return addSigToThreadState(state, sig)
  }

  public async signDepositRequestProposal(args: Omit<SignedDepositRequestProposal, 'sigUser'>, ): Promise<SignedDepositRequestProposal> {
    const hash = this.utils.createDepositRequestProposalHash(args)
    const sig = await this.wallet.signMessage(hash)

    console.log(`Signing deposit request ${JSON.stringify(args, null, 2)}. Sig: ${sig}`)
    return { ...args, sigUser: sig }
  }

  public async getContractEvents(eventName: string, fromBlock: number) {
    return this.contract.getPastEvents(eventName, [this.wallet.address], fromBlock)
  }

  protected _latestState: PersistentState | null = null
  protected _saving: Promise<void> = Promise.resolve()
  protected _savePending = false

  protected async _saveState(state: ConnextState) {
    if (!this.opts.saveState)
      return

    if (this._latestState === state.persistent)
      return

    this._latestState = state.persistent
    if (this._savePending)
      return

    this._savePending = true

    this._saving = new Promise((res, rej) => {
      // Only save the state after all the currently pending operations have
      // completed to make sure that subsequent state updates will be atomic.
      setTimeout(async () => {
        let err = null
        try {
          await this._saveLoop()
        } catch (e) {
          err = e
        }
        // Be sure to set `_savePending` to `false` before resolve/reject
        // in case the state changes during res()/rej()
        this._savePending = false
        return err ? rej(err) : res()
      }, 1)
    })
  }

  /**
   * Because it's possible that the state will continue to be updated while
   * a previous state is saving, loop until the state doesn't change while
   * it's being saved before we return.
   */
  protected async _saveLoop() {
    let result: Promise<any> | null = null
    while (true) {
      const state = this._latestState!
      result = this.opts.saveState!(JSON.stringify(state))

      // Wait for any current save to finish, but ignore any error it might raise
      const [timeout, _] = await timeoutPromise(
        result.then(null, () => null),
        10 * 1000,
      )
      if (timeout) {
        console.warn(
          'Timeout (10 seconds) while waiting for state to save. ' +
          'This error will be ignored (which may cause data loss). ' +
          'User supplied function that has not returned:',
          this.opts.saveState
        )
      }

      if (this._latestState == state)
        break
    }
  }

  /**
   * Waits for any persistent state to be saved.
   *
   * If the save fails, the promise will reject.
   */
  awaitPersistentStateSaved(): Promise<void> {
    return this._saving
  }

  protected async getStore(): Promise<ConnextStore> {
    if (this.store)
      return this.store

    const state = new ConnextState()
    state.persistent.channel = {
      ...state.persistent.channel,
      contractAddress: this.contractAddress || '', // TODO: how to handle this while undefined?
      user: this.wallet.address,
      recipient: this.wallet.address,
    }
    state.persistent.latestValidState = state.persistent.channel

    if (this.opts.loadState) {
      const loadedState = await this.opts.loadState()
      if (loadedState)
        state.persistent = JSON.parse(loadedState)
    }
    return createStore(reducers, state, applyMiddleware(handleStateFlags))
  }

  getLogger(name: string): Logger {
    return {
      source: name,
      async logToApi(...args: any[]) {
        console.log(`${name}:`, ...args)
      },
    }

  }

  private dispatch(action: Action): void {
    this.store.dispatch(action)
  }

  private getControllers(): AbstractController[] {
    const res: any[] = []
    for (let key of Object.keys(this)) {
      const val = (this as any)[key]
      const isController = (
        val &&
        isFunction(val['start']) &&
        isFunction(val['stop']) &&
        val !== this
      )
      if (isController)
        res.push(val)
    }
    return res
  }

}
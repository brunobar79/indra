import * as eth from 'ethers';
import { createStore } from 'redux'
import {
  assert,
  getChannelState,
  getDepositArgs,
  getExchangeArgs,
  getPaymentArgs,
  getThreadState,
  getWithdrawalArgs,
  mkAddress,
  mkHash,
  PartialSignedOrSuccinctChannel,
  PartialSignedOrSuccinctThread,
  getCustodialBalance,
} from '.'
import { ConnextOptions, ConnextInstance } from '../Connext'
import { default as ChannelManagerAbi } from '../contract/ChannelManagerAbi'
import { IChannelManager } from '../contract/ChannelManager'
import { Big } from '../lib/bn'
import { IHubAPIClient } from '../Hub'
import { reducers } from "../state/reducers";
import { ConnextState, PersistentState, RuntimeState } from '../state/store';
import { StateGenerator } from '../StateGenerator';
import {
  Address,
  addSigToChannelState,
  addSigToThreadState,
  ArgsTypes,
  ChannelManagerChannelDetails,
  ChannelRow,
  ChannelState,
  ChannelStateUpdate,
  ChannelUpdateReason,
  convertChannelState,
  convertThreadState,
  convertWithdrawalParameters,
  DepositArgs,
  DepositArgsBN,
  LogDescription,
  ExchangeArgs,
  ExchangeArgsBN,
  ExchangeRates,
  HubConfig,
  Omit,
  PaymentBN,
  Payment,
  PurchasePayment,
  PurchasePaymentHubResponse,
  SignedDepositRequestProposal,
  Sync,
  SyncResult,
  ThreadHistoryItem,
  ThreadRow,
  ThreadState,
  ThreadStateBN,
  ThreadStateUpdate,
  Transaction,
  UnsignedChannelState,
  UnsignedThreadState,
  UpdateRequest,
  WithdrawalParameters,
  CustodialBalanceRow,
} from '../types'
import Wallet from '../Wallet';

const createTx = (opts?: any): Transaction => {
  const defaultTx = {
    hash: '0xabc123',
    to: '0xabc123',
    from: '0xabc123',
    nonce: 1,
    gasLimit: eth.utils.bigNumberify('0x1'),
    gasPrice: eth.utils.bigNumberify('0x2'),
    data: '0x',
    value: eth.utils.bigNumberify('0x100'),
    chainId: '0x1',
    r: '0xabc123',
    s: '0xabc123',
    v: 0,
  }
  return Object.assign(defaultTx, opts)
}

export class MockConnextInstance extends ConnextInstance {
  mockContract: MockChannelManager
  mockHub: MockHub

  constructor(opts: Partial<ConnextOptions> = {}) {
    const store = opts.store || new MockStore().createStore()

    const oldDispatch = store.dispatch as any
    const actions: any[] = []
    store.dispatch = function (...args: any[]) {
      actions.push(args[0])
      return oldDispatch.call(this, ...args)
    }
    afterEach(function () {
      // ignore this as any ts err
      if ((this as any).currentTest.state == 'failed') {
        console.error('Actions emitted during test: ' + (actions.length ? '' : '(no actions)'))
        actions.forEach(action => {
          console.error('  ', JSON.stringify(action))
        })
      }
    })

    const moreOpts = {
      user: mkAddress('0x123'),
      contractAddress: mkAddress('0xccc'),
      contract: new MockChannelManager(),
      ethUrl: 'http://localhost:8545',
      hub: new MockHub(),
      hubAddress: mkAddress('0xhhh'),
      store,
      ...opts,
    } as any

    const wallet = new Wallet(moreOpts)
    const provider = new eth.providers.JsonRpcProvider(moreOpts.ethUrl)

    super(moreOpts , wallet)

    this.mockContract = this.contract as MockChannelManager
    this.mockHub = this.hub as MockHub

    // stub out actual sig recovery methods, only test presence
    this.validator.assertChannelSigner = (channelState: ChannelState, signer: "user" | "hub" = "user"): void => { return }

    this.validator.assertThreadSigner = (thread: ThreadState): void => { return }

    this.validator.assertDepositRequestSigner = (req: SignedDepositRequestProposal, signer: Address): void => { return }

    after(() => this.stop())
  }

  async signChannelState(state: UnsignedChannelState): Promise<ChannelState> {
    const { user, hubAddress } = this.opts
    return addSigToChannelState(state, mkHash('0x987123'), user !== hubAddress)
  }

  async signThreadState(state: UnsignedThreadState): Promise<ThreadState> {
    return addSigToThreadState(state, mkHash('0x51512'))
  }

  async signDepositRequestProposal(args: Omit<SignedDepositRequestProposal, 'sigUser'>,): Promise<SignedDepositRequestProposal> {
    return { ...args, sigUser: mkHash('0xalsd23')}
  }

  async getContractEvents(eventName: string, fromBlock: number): Promise<LogDescription[]> {
    return []
  }

}

export class MockChannelManager implements IChannelManager {
  contractMethodCalls = [] as any[]

  gasMultiple = 1.5
  abi: any
  rawAbi: any = ChannelManagerAbi.abi

  assertCalled(method: keyof MockChannelManager, ...args: any[]) {
    for (let call of this.contractMethodCalls) {
      if (call.name == method) {
        try {
          assert.containSubset(call.args, args)
          return
        } catch (e) {
          // do nothing
        }
      }
    }

    assert.fail(
      `No contract methods calls matching '${method}(${JSON.stringify(args)})' were made!\n` +
      `Method calls:\n${this.contractMethodCalls.map(c => JSON.stringify(c)).join('\n')}`
    )
  }

  async userAuthorizedUpdate(state: ChannelState) {
    this.contractMethodCalls.push({
      name: 'userAuthorizedUpdate',
      args: [state],
    })
    return createTx()
  }

  async getPastEvents(eventName: string, user: string[], fromBlock: number) {
    return []
  }

  async getChannelDetails(user: string): Promise<ChannelManagerChannelDetails> {
    throw new Error('TODO: mock getChannelDetails')
  }

  async startExit(state: ChannelState): Promise<Transaction> {
    throw new Error('TODO: mock startExit')
  }
  async startExitWithUpdate(state: ChannelState): Promise<Transaction> {
    throw new Error('TODO: mock startExitWithUpdate')
  }
  async emptyChannelWithChallenge(state: ChannelState): Promise<Transaction> {
    throw new Error('TODO: mock emptyChannelWithChallenge')
  }
  async emptyChannel(state: ChannelState): Promise<Transaction> {
    throw new Error('TODO: mock emptyChannel')
  }
  async startExitThread(state: ChannelState, threadState: ThreadState, proof: any): Promise<Transaction> {
    throw new Error('TODO: mock startExitThread')
  }
  async startExitThreadWithUpdate(state: ChannelState, threadInitialState: ThreadState, threadUpdateState: ThreadState, proof: any): Promise<Transaction> {
    throw new Error('TODO: mock startExitThreadWithUpdate')
  }
  async challengeThread(state: ChannelState, threadState: ThreadState): Promise<Transaction> {
    throw new Error('TODO: mock challengeThread')
  }
  async emptyThread(state: ChannelState, threadState: ThreadState, proof: any): Promise<Transaction> {
    throw new Error('TODO: mock emptyThread')
  }
  async nukeThreads(state: ChannelState): Promise<Transaction> {
    throw new Error('TODO: mock nukeThreads')
  }
}

export class MockHub implements IHubAPIClient {
  receivedUpdateRequests: UpdateRequest[] = []

  async config(): Promise<HubConfig> {
    //TODO: implement correctly
    return { 
      beiMaxCollateralization: '100',
      hubAddress: mkAddress("0xhhh")
    } as any
  }

  async getCustodialBalance(): Promise<CustodialBalanceRow | null> {
    return getCustodialBalance("empty")
  }

  async authChallenge(): Promise<string> {
    return 'nonce'
  }
  async authResponse(nonce: string, address: string, origin: string, signature: string): Promise<string> {
    return 'hub-token-returned'
  }
  async getAuthStatus(): Promise<{ success: boolean, address?: Address }> {
    return { success: true, address: mkAddress('0xUUU') }
  }

  async getAuthToken(): Promise<string> {
    return 'abc123'
  }
  
  async getChannelByUser(recipient: string): Promise<ChannelRow> {
    return {
      id: 0,
      status: 'CS_OPEN',
      lastUpdateOn: new Date(),
      user: mkAddress('0xUUU'),
      state: getChannelState('full', { user: recipient }),
    }
  }

  async recipientNeedsCollateral(): Promise<string | null> {
    return null
  }

  async redeem(secret: string): Promise<PurchasePaymentHubResponse & { amount: Payment }> {
    // NOTE: by default assumes this is redeemers first payment
    // if this is not what you are testing against, must use
    // the patch functions in test
    return {
      purchaseId: 'async-payment-bb',
      sync: { status: "CS_OPEN", 
      updates: [{
        type: 'channel',
        update: {
          reason: 'ProposePendingDeposit',
          createdOn: new Date(),
          args: getDepositArgs('full', {
            depositToken: [0, 1],
            depositWei: [0, 0],
          }),
          sigHub: mkHash('0x51512'),
          sigUser: '',
          txCount: 1,
        },
      }]},
      amount: {
        amountWei: '0',
        amountToken: '1',
      }
    }
  }

  async getChannel(): Promise<ChannelRow> {
    return {
      id: 0,
      status: 'CS_OPEN',
      lastUpdateOn: new Date(),
      user: mkAddress('0xUUU'),
      state: getChannelState('full'),
    }
  }

  async getActiveThreads(): Promise<ThreadState[]> {
    return []
  }

  async getLastThreadUpdateId(): Promise<number> {
    return 0
  }

  async getAllThreads(): Promise<ThreadState[]> {
    return []
  }

  async getChannelStateAtNonce(): Promise<ChannelStateUpdate> {
    return {
      args: {} as ExchangeArgs,
      reason: 'Exchange',
      state: getChannelState('full'),
    }
  }

  async getThreadInitialStates(): Promise<ThreadState[]> {
    return [getThreadState('full')]
  }

  async getIncomingThreads(): Promise<ThreadRow[]> {
    return [{
      id: 1,
      status: 'CT_OPEN',
      state: getThreadState('full')
    }]
  }

  async getThreadByParties(): Promise<ThreadRow> {
    return {
      id: 1,
      status: 'CT_OPEN',
      state: getThreadState('full')
    }
  }

  async sync(txCountGlobal: number, lastThreadUpdateId: number): Promise<Sync> {
    // needs to be able to take an update from the store, and apply it
    return { status: "CS_OPEN", updates: [] }
  }

  async buy<PurchaseMetaType=any, PaymentMetaType=any>(
    meta: PurchaseMetaType,
    payments: PurchasePayment<PaymentMetaType>[],
  ): Promise<PurchasePaymentHubResponse> {
    const updates = payments.map(p => {
      if ((p.update as UpdateRequest).sigUser) {
        // user signed update, add to recieved
        console.log("TEST INCLUSION")
        this.receivedUpdateRequests.push(p.update as UpdateRequest)
      }
      if (p.type == 'PT_CHANNEL' || p.type == 'PT_LINK' || p.type == 'PT_CUSTODIAL') {
        return {
          type: 'channel',
          update: {
            reason: 'Payment',
            createdOn: new Date(),
            args: getPaymentArgs('full', { amountToken: p.amount.amountToken, amountWei: p.amount.amountWei }),
            sigHub: mkHash('0x51512'),
            sigUser: (p.update as UpdateRequest).sigUser || '',
            txCount: (p.update as UpdateRequest).sigUser ? (p.update as UpdateRequest).txCount! : (p.update as UpdateRequest).txCount! + 1,
          } as UpdateRequest
        } as SyncResult
      } else {
        return {
          type: 'thread',
          update: { 
            state: (p.update as any).state, 
            id: (p.update as any).state.threadId, 
            createdOn: new Date() 
          }
        } as SyncResult
      }
    })

    return {
      purchaseId: 'some-purchase-id',
      sync: { status: "CS_OPEN", updates },
    }
  }

  async requestDeposit(deposit: SignedDepositRequestProposal, txCount: number, lastThreadUpdateId: number): Promise<Sync> {
    return {
      status: 'CS_OPEN',
      updates: [{
        type: 'channel',
        update: {
          reason: 'ProposePendingDeposit',
          createdOn: new Date(),
          args: getDepositArgs('full', {
            sigUser: deposit.sigUser,
            depositWeiUser: deposit.amountWei,
            depositTokenUser: deposit.amountToken,
            timeout: parseInt('' + (Date.now() / 1000 + 269)),
          }),
          sigHub: mkHash('0x51512'),
          txCount: txCount + 1,
        },
      }]
    }
  }

  async requestWithdrawal(params: WithdrawalParameters, txCountGlobal: number): Promise<Sync> {
    const { withdrawalWeiUser, withdrawalTokenUser, ...res } = params
    return {
      status: 'CS_OPEN',
      updates: 
      [{
        type: 'channel',
        update: {
          reason: 'ProposePendingWithdrawal',
          createdOn: new Date(),
          args: getWithdrawalArgs('empty', {
            ...res,
            targetWeiHub: '0',
            targetWeiUser: '0',
            targetTokenHub: '0',
            targetTokenUser: '0',
            additionalWeiHubToUser: '0',
            additionalTokenHubToUser: '0',
            timeout: +(Date.now() / 1000 + 60).toFixed(),
          }),
          txCount: txCountGlobal + 1,
        },
      }]
    }
  }

  async requestExchange(weiToSell: string, tokensToSell: string, txCountGlobal: number): Promise<Sync> {
    return {
      status: 'CS_OPEN',
      updates:
      [{
        type: 'channel',
        update: {
          reason: 'Exchange',
          createdOn: new Date(),
          args: getExchangeArgs('full', {
            exchangeRate: '5',
            tokensToSell: Big(tokensToSell),
            weiToSell: Big(weiToSell),
            seller: "user"
          }),
          txCount: txCountGlobal + 1,
        },
      }]
    }
  }

  async getExchangeRates(): Promise<ExchangeRates> {
    return { 'USD': '5' }
  }

  async requestCollateral(txCountGlobal: number): Promise<Sync> {
    return {
      status: 'CS_OPEN',
      updates:
      [{
        type: 'channel',
        update: {
          reason: 'ProposePendingDeposit',
          createdOn: new Date(),
          args: getDepositArgs('full', {
            depositTokenHub: Big(69),
            depositTokenUser: Big(0),
            depositWeiHub: Big(420),
            depositWeiUser: Big(0),
            timeout: Math.floor(Date.now() / 1000) + 69
          }),
          txCount: txCountGlobal + 1,
        },
      }]
    }
  }

  async updateHub(updates: UpdateRequest[], lastThreadUpdateId: number): Promise<{ error: null, updates: Sync }> {
    this.receivedUpdateRequests = [
      ...this.receivedUpdateRequests,
      ...updates,
    ]
    let createdOn = new Date;
    return {
      error: null,
      updates: {
        status: "CS_OPEN",
        updates: updates.map(up => ({
          type: 'channel' as 'channel',
          update: {
            ...up,
            createdOn,
            sigHub: up.sigHub || '0xMockHubSig',
          },
        }))
      },
    }
  }

  async updateThread(update: ThreadStateUpdate): Promise<ThreadStateUpdate> {
    update.createdOn = new Date();
    return update
  }
  
  async getLatestChannelStateAndUpdate() {
    return null
    // let store = new MockStore()
    // return {state: store._initialState.persistent.channel, update: store._initialState.persistent.channelUpdate}
  }

  async getLatestStateNoPendingOps(): Promise<ChannelState | null> {
    return null
  }

  assertReceivedUpdate(expected: PartialUpdateRequest) {
    for (let req of this.receivedUpdateRequests as any[]) {
      if (typeof expected.sigUser == 'boolean')
        req = { ...req, sigUser: !!req.sigUser }
      if (typeof expected.sigHub == 'boolean')
        req = { ...req, sigHub: !!req.sigHub }
      try {
        assert.containSubset(req, expected)
        return
      } catch (e) {
        continue
      }
    }

    console.log('this.receivedUpdateRequests: ', this.receivedUpdateRequests);

    assert.fail(
      `Hub did not recieve any updates matching ${JSON.stringify(expected)}. Got:\n` +
      this.receivedUpdateRequests.map(x => JSON.stringify(x)).join('\n')
    )
  }
}

type PartialUpdateRequest = {
  reason: ChannelUpdateReason
  args: Partial<ArgsTypes>
  txCount?: number
  sigUser?: number | boolean
  sigHub?: number | boolean
}

export class MockStore {
  public _initialState: ConnextState = {
    runtime: new RuntimeState(),
    persistent: new PersistentState(),
  }

  public createStore: any = () => {
    return createStore(reducers, this._initialState)
  }

  public setInitialConnextState = (state: ConnextState) => {
    this._initialState = state
  }

  public setExchangeRate = (rates: ExchangeRates) => {
    this._initialState = {
      ...this._initialState,
      runtime: {
        ...this._initialState.runtime,
        exchangeRate: { lastUpdated: new Date(), rates }
      }
    }
  }

  public setSyncResultsFromHub = (syncResultsFromHub: SyncResult[]) => {
    this._initialState = {
      ...this._initialState,
      runtime: {
        ...this._initialState.runtime,
        syncResultsFromHub,
      }
    }
  }

  /* PERSISTENT STORE SETTINGS */
  public setChannel = (overrides: PartialSignedOrSuccinctChannel = {}) => {
    this._initialState = {
      ...this._initialState,
      persistent: {
        ...this._initialState.persistent,
        channel: getChannelState("empty", {
          txCountChain: 0,
          txCountGlobal: 0,
          sigHub: '0xsig-hub',
          sigUser: '0xsig-user',
        }, overrides)
      }
    }
  }

  public setHubAddress = (hubAddress: string = mkAddress("0xhhh")) => {
    this._initialState = {
      ...this._initialState,
      persistent: {
        ...this._initialState.persistent,
        hubAddress,
      }
    }
  }

  public setLatestValidState = (overrides: PartialSignedOrSuccinctChannel = {}) => {
    this._initialState = {
      ...this._initialState,
      persistent: {
        ...this._initialState.persistent,
        latestValidState: getChannelState("empty", {
          txCountChain: 0,
          txCountGlobal: 0,
          sigHub: '0xsig-hub',
          sigUser: '0xsig-user',
        }, overrides)
      }
    }
  }

  public setChannelUpdate = (update: UpdateRequest) => {
    this._initialState = {
      ...this._initialState,
      persistent: {
        ...this._initialState.persistent,
        channelUpdate: update,
      }
    }
  }

  public addThread = (overrides: PartialSignedOrSuccinctThread) => {
    const initialThread = addSigToThreadState(getThreadState("empty", overrides), mkHash('0xMockUserSig'))

    // Get state from store
    let {
      activeThreads,
      threadHistory,
      channel,
      activeInitialThreadStates,
      lastThreadUpdateId,
    } = this._initialState.persistent

    const initialThreadBN = convertThreadState('bn', initialThread)
    // Create new openThread state
    let newState = new StateGenerator("").openThread(
      convertChannelState('bn', channel),
      activeInitialThreadStates,
      initialThreadBN,
    )
    newState = addSigToChannelState(newState, mkHash('0xMockUserSig'), true)
    newState = addSigToChannelState(newState, mkHash('0xMockHubSig'), false)

    activeInitialThreadStates = activeInitialThreadStates.concat([initialThread])
    threadHistory = threadHistory.concat([{ sender: initialThread.sender, receiver: initialThread.receiver, threadId: initialThread.threadId }])
    activeThreads = activeThreads.concat([initialThread])

    this._initialState = {
      ...this._initialState,
      persistent: {
        ...this._initialState.persistent,
        channel: newState as ChannelState,
        threadHistory,
        activeInitialThreadStates,
        activeThreads,
        lastThreadUpdateId, // only updated on thread updates
      },
    }
  }

  public updateThread = (threadHistoryItem: ThreadHistoryItem, payment: PaymentBN) => {
    // Get state from store
    let {
      activeThreads,
      lastThreadUpdateId,
    } = this._initialState.persistent

    const thread = activeThreads.filter(state => (state.sender === threadHistoryItem.sender && 
      threadHistoryItem.receiver == threadHistoryItem.receiver && state.threadId == threadHistoryItem.threadId))

    const threadBN = convertThreadState('bn', thread[0])

    // Create thread update
    let threadUpdate = new StateGenerator("").threadPayment(threadBN, payment)
    threadUpdate = addSigToThreadState(threadUpdate, mkHash('0xMockUserSig'))

    // Update active thread with thread update
    activeThreads = activeThreads.filter(state => !(state.sender === threadHistoryItem.sender && 
      threadHistoryItem.receiver == threadHistoryItem.receiver && state.threadId == threadHistoryItem.threadId)).concat([threadUpdate as ThreadState])

    this._initialState = {
      ...this._initialState,
      persistent: {
        ...this._initialState.persistent,
        activeThreads,
        lastThreadUpdateId: lastThreadUpdateId++
      },
    }
  }  

  public setThreadHistory = (threadHistory: ThreadHistoryItem[]) => {
    this._initialState = {
      ...this._initialState,
      persistent: {
        ...this._initialState.persistent,
        threadHistory,
      },
    }
  }

  public setLastThreadUpdateId = (lastThreadUpdateId: number) => {
    this._initialState = {
      ...this._initialState,
      persistent: {
        ...this._initialState.persistent,
        lastThreadUpdateId,
      },
    }
  }

  public setSyncControllerState = (syncResults: SyncResult[]) => {
    this._initialState = {
      ...this._initialState,
      persistent: {
        ...this._initialState.persistent,
        syncControllerState: {
          updatesToSync: syncResults,
        }
      }
    }
  }
}

/**
 * Patch a function.
 *
 * Will set `host[attr]` to a function which will call `func`, providing the
 * old function as the frist argument.
 *
 * For example, to patch `console.log` so all log lines would be prefixed with
 * '[LOG]':
 *
 *  patch(console, 'log', (old, ...args) => {
 *    old.call(this, '[LOG] ', ...args)
 *  })
 */
export function patch<T, Attr extends keyof T>(host: T, attr: Attr, func: any) {
  let old: any = host[attr]
  if (!old) {
    let suffix = ''
    if ((old.prototype || {} as any)[attr])
      suffix = ` (but its prototype does; did you forget '.prototype'?)`
    throw new Error(`${host} has no attribute '${attr}'${suffix}`)
  }
  host[attr] = function (this: T) {
    // NOTE: causes compiler errors in the wallet
    return (func as any).call(this, old.bind(this), ...(arguments as any))
  } as any
  return old
}

/* Generated by ts-generator ver. 0.0.8 */
/* tslint:disable */

import Contract, { CustomOptions, contractOptions } from "web3/eth/contract";
import { TransactionObject, BlockType } from "web3/eth/types";
import { Callback, EventLog } from "web3/types";
import { EventEmitter } from "events";
import { Provider } from "web3/providers";

export class ChannelManager {
  constructor(jsonInterface: any[], address?: string, options?: CustomOptions);
  _address: string;
  options: contractOptions;
  methods: {
    channels(
      arg0: string
    ): TransactionObject<{
      0: string;
      1: string;
      2: string;
      3: string;
      4: string;
    }>;

    getChannelBalances(
      user: string
    ): TransactionObject<{
      0: string;
      1: string;
      2: string;
      3: string;
      4: string;
      5: string;
    }>;

    getChannelDetails(
      user: string
    ): TransactionObject<{
      0: string;
      1: string;
      2: string;
      3: string;
      4: string;
      5: string;
      6: string;
    }>;

    hubContractWithdraw(
      weiAmount: number | string,
      tokenAmount: number | string
    ): TransactionObject<void>;

    hubAuthorizedUpdate(
      user: string,
      recipient: string,
      weiBalances: (number | string)[],
      tokenBalances: (number | string)[],
      pendingWeiUpdates: (number | string)[],
      pendingTokenUpdates: (number | string)[],
      txCount: (number | string)[],
      threadRoot: string | number[],
      threadCount: number | string,
      timeout: number | string,
      sigUser: string
    ): TransactionObject<void>;

    userAuthorizedUpdate(
      recipient: string,
      weiBalances: (number | string)[],
      tokenBalances: (number | string)[],
      pendingWeiUpdates: (number | string)[],
      pendingTokenUpdates: (number | string)[],
      txCount: (number | string)[],
      threadRoot: string | number[],
      threadCount: number | string,
      timeout: number | string,
      sigHub: string
    ): TransactionObject<void>;

    startExit(user: string): TransactionObject<void>;

    startExitWithUpdate(
      user: (string)[],
      weiBalances: (number | string)[],
      tokenBalances: (number | string)[],
      pendingWeiUpdates: (number | string)[],
      pendingTokenUpdates: (number | string)[],
      txCount: (number | string)[],
      threadRoot: string | number[],
      threadCount: number | string,
      timeout: number | string,
      sigHub: string,
      sigUser: string
    ): TransactionObject<void>;

    emptyChannelWithChallenge(
      user: (string)[],
      weiBalances: (number | string)[],
      tokenBalances: (number | string)[],
      pendingWeiUpdates: (number | string)[],
      pendingTokenUpdates: (number | string)[],
      txCount: (number | string)[],
      threadRoot: string | number[],
      threadCount: number | string,
      timeout: number | string,
      sigHub: string,
      sigUser: string
    ): TransactionObject<void>;

    emptyChannel(user: string): TransactionObject<void>;

    startExitThread(
      user: string,
      sender: string,
      receiver: string,
      threadId: number | string,
      weiBalances: (number | string)[],
      tokenBalances: (number | string)[],
      proof: (string | number[])[],
      sig: string
    ): TransactionObject<void>;

    startExitThreadWithUpdate(
      user: string,
      threadMembers: (string)[],
      threadId: number | string,
      weiBalances: (number | string)[],
      tokenBalances: (number | string)[],
      proof: (string | number[])[],
      sig: string,
      updatedWeiBalances: (number | string)[],
      updatedTokenBalances: (number | string)[],
      updatedTxCount: number | string,
      updateSig: string
    ): TransactionObject<void>;

    challengeThread(
      sender: string,
      receiver: string,
      threadId: number | string,
      weiBalances: (number | string)[],
      tokenBalances: (number | string)[],
      txCount: number | string,
      sig: string
    ): TransactionObject<void>;

    emptyThread(
      user: string,
      sender: string,
      receiver: string,
      threadId: number | string,
      weiBalances: (number | string)[],
      tokenBalances: (number | string)[],
      proof: (string | number[])[],
      sig: string
    ): TransactionObject<void>;

    nukeThreads(user: string): TransactionObject<void>;

    totalChannelWei(): TransactionObject<string>;
    totalChannelToken(): TransactionObject<string>;
    hub(): TransactionObject<string>;
    NAME(): TransactionObject<string>;
    approvedToken(): TransactionObject<string>;
    challengePeriod(): TransactionObject<string>;
    VERSION(): TransactionObject<string>;
    getHubReserveWei(): TransactionObject<string>;
    getHubReserveTokens(): TransactionObject<string>;
  };
  deploy(options: {
    data: string;
    arguments: any[];
  }): TransactionObject<Contract>;
  events: {
    DidHubContractWithdraw(
      options?: {
        filter?: object;
        fromBlock?: BlockType;
        topics?: string[];
      },
      cb?: Callback<EventLog>
    ): EventEmitter;

    DidUpdateChannel(
      options?: {
        filter?: object;
        fromBlock?: BlockType;
        topics?: string[];
      },
      cb?: Callback<EventLog>
    ): EventEmitter;

    DidStartExitChannel(
      options?: {
        filter?: object;
        fromBlock?: BlockType;
        topics?: string[];
      },
      cb?: Callback<EventLog>
    ): EventEmitter;

    DidEmptyChannel(
      options?: {
        filter?: object;
        fromBlock?: BlockType;
        topics?: string[];
      },
      cb?: Callback<EventLog>
    ): EventEmitter;

    DidStartExitThread(
      options?: {
        filter?: object;
        fromBlock?: BlockType;
        topics?: string[];
      },
      cb?: Callback<EventLog>
    ): EventEmitter;

    DidChallengeThread(
      options?: {
        filter?: object;
        fromBlock?: BlockType;
        topics?: string[];
      },
      cb?: Callback<EventLog>
    ): EventEmitter;

    DidEmptyThread(
      options?: {
        filter?: object;
        fromBlock?: BlockType;
        topics?: string[];
      },
      cb?: Callback<EventLog>
    ): EventEmitter;

    DidNukeThreads(
      options?: {
        filter?: object;
        fromBlock?: BlockType;
        topics?: string[];
      },
      cb?: Callback<EventLog>
    ): EventEmitter;

    allEvents: (
      options?: {
        filter?: object;
        fromBlock?: BlockType;
        topics?: string[];
      },
      cb?: Callback<EventLog>
    ) => EventEmitter;
  };
  getPastEvents(
    event: string,
    options?: {
      filter?: object;
      fromBlock?: BlockType;
      toBlock?: BlockType;
      topics?: string[];
    },
    cb?: Callback<EventLog[]>
  ): Promise<EventLog[]>;
  setProvider(provider: Provider): void;
}

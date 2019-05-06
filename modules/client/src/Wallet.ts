import { ethers as eth } from 'ethers';
import Web3 from 'web3';
import { ConnextOptions } from './ConnextInstance';
import {
  TransactionRequest,
  TransactionResponse,
  objMapPromise
} from './types';
import { TransactionConfig } from 'web3-core';

export default class Wallet extends eth.Signer {
  address: string
  provider: eth.providers.BaseProvider
  signer?: eth.Wallet
  web3?: Web3
  private password: string

  constructor(opts: ConnextOptions) {
    super()
    this.password = opts.password || ''

    ////////////////////////////////////////
    // Connect to an eth provider

    // First choice: use connext provider
    if (opts.connextProvider) {
      // TODO: proper way to instantiate??
      // for now, can be ethUrl
      this.provider = new eth.providers.JsonRpcProvider(opts.connextProvider)

    // Second choice: use provided web3
    } else if (opts.web3 && opts.web3.currentProvider) {
      // TODO: wtf??? Web3EthereumProvider from Web3 is not
      // compatible with Web3Provider from ethers/providers
      this.provider = new eth.providers.Web3Provider(opts.web3.currentProvider as any)
    } else {
      // NOTE: cannot use default hub provider without a hubUrl
      throw new Error("Cannot find provider in given options")
    }

    ////////////////////////////////////////
    // Setup our a signer

    // First choice: Sign w private key
    if (opts.privateKey) {
      this.signer = new eth.Wallet(opts.privateKey || '')
      this.signer.connect(this.provider)
      this.address = this.signer.address.toLowerCase()

    // Second choice: Sign w mnemonic
    } else if (opts.mnemonic) {
      this.signer = eth.Wallet.fromMnemonic(opts.mnemonic || '')
      this.signer.connect(this.provider)
      this.address = this.signer.address.toLowerCase()

    // Third choice: Sign w web3
    } else if (opts.address && opts.web3 && opts.web3.eth && opts.web3.eth.sign) {
      this.web3 = opts.web3
      this.address = opts.address.toLowerCase()
      this.web3.eth.defaultAccount = this.address

    // Default: create new random mnemonic
    } else {
      this.signer = eth.Wallet.createRandom()
      this.signer.connect(this.provider)
      this.address = this.signer.address.toLowerCase()
      console.warn(`Generated a new signing key, make sure you back it up before sending funds`)
    }
  }

  async getAddress() {
    return this.address
  }

  async signMessage(message: string) {
    const bytes = eth.utils.isHexString(message)
      ? eth.utils.arrayify(message)
      : eth.utils.toUtf8Bytes(message)

    if (this.signer) {
      return await this.signer.signMessage(bytes)
    }
    if (this.web3) {
      let sig

      // Modern versions of web3 will add the standard ethereum message prefix for us 
      sig = await this.web3.eth.sign(eth.utils.hexlify(bytes), this.address)
      if (this.address === eth.utils.verifyMessage(bytes, sig).toLowerCase()) {
        return sig
      }

      // Old versions of web3 did not, we'll add it ourself
      sig = await this.web3.eth.sign(eth.utils.hashMessage(bytes), this.address)
      if (this.address === eth.utils.verifyMessage(bytes, sig).toLowerCase()) {
        return sig
      }

      // Weird version of web3 that does something else? idk then
      throw new Error(`Couldn't find a web3 signing method that works...`)
    }
    throw new Error(`Could not sign message`)
  }

  async signTransaction(tx: TransactionRequest): Promise<string> {
    if (this.signer) {
      return await this.signer.sign(tx)
    }
    if (this.web3) {
      // resolve any fields
      const resolved = await objMapPromise(tx, async (k, v) => await v) as any
      // convert to right object
      const txObj: TransactionConfig = {
        from: this.address,
        to: resolved.to,
        value: resolved.value,
        gas: parseInt(resolved.gasLimit),
        gasPrice: resolved.gasPrice,
        data: resolved.data,
      }
      return (await this.web3.eth.signTransaction(txObj)).raw // TODO: fix type
    }
    throw new Error(`Could not sign transaction`)
  }

  async sendTransaction(txReq: TransactionRequest): Promise<TransactionResponse> {
    // TransactionRequest properties can be promises, make sure they've all resolved
    const tx = await objMapPromise(txReq, async (k, v) => await v) as any

    const signedTx = await this.signTransaction(tx)
    if (this.provider) {
      return await this.provider.sendTransaction(signedTx)
    } else if (this.web3) {
      const receipt = await this.web3.eth.sendSignedTransaction(signedTx)
      // cast receipt to object
      // NOTE: THIS IS AN INCOMPLETE CASTING
      // Not a huge deal right now, we only ever use the `.hash` property of the return value
      // TODO: should be consistent
      const response = {
        blockHash: receipt.blockHash,
        blockNumber: receipt.blockNumber,
        to: receipt.to,
        hash: receipt.transactionHash,
        from: receipt.from,
      } as TransactionResponse
      return response
    }
    throw new Error("Could not send transaction")
  }

}


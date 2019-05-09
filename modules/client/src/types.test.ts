import * as t from './testing/index'
import { BigNumber as BN } from 'ethers/utils'
import { assert } from './testing/index'
import { convertChannelState, convertThreadState, convertFields, insertDefault, objMapPromise, objMap, makeEventVerbose, isBN, convertVerboseEvent, VerboseChannelEvent, ChannelEventReason } from './types'
import { Validator } from './validator';
import { default as ChannelManagerAbi } from './contract/ChannelManagerAbi'
import Web3 from 'web3';
import { EMPTY_ROOT_HASH } from './lib/constants';

describe('insertDefault', () => {
  it("should work", () => {
    const tst = {
      tokensToSell: '10',
      testing: null,
    }
    const keys = [
      'testing',
      'all',
      'zeroes',
    ]
    const ans = insertDefault('0', tst, keys)
    assert.containSubset(ans, {
      tokensToSell: '10',
      testing: '0',
      all: '0',
      zeroes: '0'
    })
  })
})

describe('convertChannelState', () => {
  it('should work for strings', () => {
    const obj = t.getChannelState('empty')
    const unsigned = convertChannelState("str-unsigned", obj)
    assert.equal(Object.keys(unsigned).indexOf('sigHub'), -1)
    assert.equal(Object.keys(unsigned).indexOf('sigUser'), -1)
  })

  it('should work for bn', () => {
    const obj = t.getChannelState('empty')
    const unsigned = convertChannelState("bn-unsigned", obj)
    assert.equal(Object.keys(unsigned).indexOf('sigHub'), -1)
    assert.equal(Object.keys(unsigned).indexOf('sigUser'), -1)
  })
})

describe('convertThreadState', () => {
  it('should work for strings', () => {
    const obj = t.getThreadState('empty')
    const unsigned = convertThreadState("str-unsigned", obj)
    assert.equal(Object.keys(unsigned).indexOf('sigA'), -1)
  })

  it('should work for bn', () => {
    const obj = t.getChannelState('empty')
    const unsigned = convertChannelState("bn-unsigned", obj)
    assert.equal(Object.keys(unsigned).indexOf('sigA'), -1)
  })
})

describe('convertFields', () => {
  const types = ['str', 'bn']
  const examples: any = {
    'str': '69',
    'bn': new BN('69'),
  }

  for (const fromType of types) {
    for (const toType of types) {
      it(`should convert ${fromType} -> ${toType}`, () => {
        const res = convertFields(fromType as any, toType as any, ['foo'], { foo: examples[fromType] })
        assert.deepEqual(res, {
          foo: examples[toType],
        })
      })
    }
  }
})

describe('objMap', () => {
  // should apply the same function to every value in the given
  // object
  it("should work with promises", async () => {
    const obj = {
      test: "str",
      me: new BN(7),
      out: new Promise((res, rej) => res('10'))
    }

    const res = await objMapPromise(obj, async (val, field) => {
      return await field
    }) as any

    assert.deepEqual(res, {
      test: "str",
      me: new BN(7),
      out: "10"
    })
  })

  it("should work with constant members", async () => {
    let args = {
      str: "This IS A CASIng TesT",
      num: 19,
      bn: new BN(8)
    }
    args = objMap(args, (k, v) => typeof v == 'string' ? v.toLowerCase() : v) as any
    assert.deepEqual(args, {
      str: "this is a casing test",
      num: 19,
      bn: new BN(8)
    })
  })
})

/**
 * NOTE: This test was added to test a *specific* event on mainnet from a transaction while debugging disputes.
 * 
 * You can use the same structure if debugging in the future, but this is designed specifically to run against the production or staging that are live.
 * 
 * It is safe to skip this test.
 * 
 * TODO: dispute e2e testing on the hub, then delete this!
 */
describe.skip("makeEventVerbose", () => {
  // instantiate a validator with mainnet provider
  const hubAddress = "0x925488C7cD7E5eB3441885c6C1dfdBEa875E08F7".toLowerCase()
  const contractAddress = "0xdfa6edAe2EC0cF1d4A60542422724A48195A5071".toLowerCase()
  const ethUrl = ""
  const provider = new Web3(ethUrl).eth
  async function getReceipt(txHash: string) {
    // get receipt
    return await provider.getTransactionReceipt(txHash)
  }
  async function checkReceipt(hash: string, eventType: ChannelEventReason, expected: Partial<VerboseChannelEvent>) {
    const validator = new Validator(hubAddress, provider, ChannelManagerAbi.abi)
    const receipt = await getReceipt(hash)
    // parse events, find matching
    // @ts-ignore
    const events = validator.parseChannelEventTxReceipt(
      eventType, 
      receipt as any, 
      contractAddress
    )
    assert.isTrue(events.length >= 1)
    assert.isTrue(isBN(events[0].pendingDepositWeiUser))
    assert.containSubset(convertVerboseEvent("str", events[0]), expected)
  }

  // taken from mainnet txs
  const didEmptyChannelTx = "0xfff66539056d9656196f380c04a51c346d9da532bea1dbb0c909756fb05af0e6"
  const didStartExitChannelTx = "0x52615819e803cfd8f3407f005286c47013fac4e525593585f51d711774cdee82"
  const didUpdateChannelTx = "0xf777f876174ba01d8f3925d030c72e534d95dcbdce4190ae8d6caa9b2d11975a"

  it('DidEmptyChannel should work with mainnet hub ', async () => {
    await checkReceipt(didEmptyChannelTx, "DidEmptyChannel", {
      txCountGlobal: 7,
      txCountChain: 2,
      pendingDepositWeiHub: "0",
      pendingDepositTokenHub: "0",
      pendingDepositWeiUser: "0",
      pendingDepositTokenUser: "0",
      pendingWithdrawalWeiHub: "0",
      pendingWithdrawalTokenHub: "0",
      pendingWithdrawalWeiUser: "0",
      pendingWithdrawalTokenUser: "0",
      threadRoot: EMPTY_ROOT_HASH,
      threadCount: 0,
      user: "0x3f1455734de606510c85f10b787b62905fa140ce",
    })
  })

  it('DidStartExitChannel should work with mainnet hub ', async () => {
    await checkReceipt(didStartExitChannelTx, "DidStartExitChannel", {
      txCountGlobal: 3,
      txCountChain: 1,
      pendingDepositWeiHub: "0",
      pendingDepositTokenHub: "0",
      pendingDepositWeiUser: "0",
      pendingDepositTokenUser: "0",
      pendingWithdrawalWeiHub: "0",
      pendingWithdrawalTokenHub: "0",
      pendingWithdrawalWeiUser: "0",
      pendingWithdrawalTokenUser: "0",
      threadRoot: EMPTY_ROOT_HASH,
      threadCount: 0,
      user: "0x30e3cdcfab00a7a689ade5bf7f0a79fefaa82947",
    })
  })

  it('DidUpdateChannel should work with mainnet hub ', async () => {
    await checkReceipt(didUpdateChannelTx, "DidUpdateChannel", {
      txCountGlobal: 5,
      txCountChain: 2,
      pendingDepositWeiHub: "0",
      pendingDepositTokenHub: "8368999999999999879",
      pendingDepositWeiUser: "50000000000000000",
      pendingDepositTokenUser: "0",
      pendingWithdrawalWeiHub: "0",
      pendingWithdrawalTokenHub: "0",
      pendingWithdrawalWeiUser: "0",
      pendingWithdrawalTokenUser: "0",
      threadRoot: EMPTY_ROOT_HASH,
      threadCount: 0,
      user: "0x155a7de8af0895bda50da4cee35a97251164e286",
    })
  })

  // TODO: testing with thread dispute events

})
import { ethers as eth } from 'ethers';
import { assert } from '../testing';
import { MockConnextInstance } from '../testing/mocks';
// @ts-ignore
global.fetch = require('node-fetch-polyfill');

describe('Redeem Controller: unit tests', () => {
  let connext: MockConnextInstance

  beforeEach(async () => {
    connext = new MockConnextInstance()
    await connext.start()
  })

  it('should work even if redeemer has no channel', async () => {
    const secret = connext.generateSecret()
    assert.isTrue(eth.utils.isHexString(secret))
    const res = await connext.redeemController.redeem(secret)
    assert.ok(res.purchaseId)

    await new Promise(res => setTimeout(res, 10))

    connext.mockHub.assertReceivedUpdate({
      reason: 'ProposePendingDeposit',
      args: {
        depositWeiUser: '0',
        depositTokenUser: '1',
      },
      sigUser: true,
      sigHub: true,
    })

    assert.containSubset(connext.store.getState(), {
      persistent: {
        channel: {
          pendingDepositTokenHub: '0',
          pendingDepositTokenUser: '1',
          pendingDepositWeiHub: '0',
          pendingDepositWeiUser: '0',
        },
      },
    })

  })

  it('should fail if invalid secret is provided', async () => {
    await assert.isRejected(
      connext.redeemController.redeem('fail'),
      /The secret provided is not a hex string./
    )
  })

  afterEach(async () => {
    await connext.stop()
  })
})

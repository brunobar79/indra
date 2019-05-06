import { MockConnextInstance, } from '../testing/mocks';
// @ts-ignore
global.fetch = require('node-fetch-polyfill');

describe('CollateralController: unit tests', () => {

  let connext: MockConnextInstance

  beforeEach(async () => {
    connext = new MockConnextInstance()
    await connext.start()
  })

  it('should work', async () => {
    await connext.collateralController.requestCollateral()

    await new Promise(res => setTimeout(res, 10))

    connext.mockHub.assertReceivedUpdate({
      reason: 'ProposePendingDeposit',
      args: {
        depositWeiHub: '420',
        depositTokenHub: '69',
        depositTokenUser: '0',
        depositWeiUser: '0',
      },
      sigUser: true,
      sigHub: false,
    })
  })

  afterEach(async () => {
    await connext.stop()
  })

})

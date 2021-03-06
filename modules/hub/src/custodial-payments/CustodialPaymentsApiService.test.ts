import { assert, getTestRegistry } from '../testing'
import { getMockWeb3, TestApiServer, MockExchangeRateDao } from '../testing/mocks'
import { mkAddress } from '../testing/stateUtils'
import { toWei, } from '../util'

import { createTestPayment } from './CustodialPaymentsDao.test'

// User service key to short-circuit address authorization
const authHeaders = { 'authorization': 'bearer unspank-the-unbanked' }

describe('CustodialPaymentsApiService', () => {
  const registry = getTestRegistry({
    Web3: getMockWeb3(),
  })
  const app: TestApiServer = registry.get('TestApiServer')
  const recipient = mkAddress('0x2')

  beforeEach(async () => {
    await registry.clearDatabase()
    const tokenAmount = toWei('4017').toString()
    await createTestPayment(
      registry,
      { amountToken: tokenAmount },
      { amountToken: tokenAmount },
      recipient,
    )
  })

  it('doGetBalance', async () => {
    const res = await app.withUser(recipient).request
      .get(`/custodial/${recipient}/balance`)
      .set(authHeaders).set('x-address', recipient)
      .send()

    assert.equal(res.status, 200)
    assert.containSubset(res.body, {
      'balanceToken': '4017000000000000000000',
      'balanceWei': '69',
      'sentWei': '0',
      'totalReceivedToken': '4017000000000000000000',
      'totalReceivedWei': '69',
      'totalWithdrawnToken': '0',
      'totalWithdrawnWei': '0',
      'user': '0x2000000000000000000000000000000000000000',
    })
  })

  it('withdrawals', async () => {
    const wdRes = await app.withUser(recipient).request
      .post(`/custodial/withdrawals`)
      .set(authHeaders).set('x-address', recipient)
      .send({ recipient, amountToken: toWei('10').toString() })
    assert.equal(wdRes.status, 200)
    const expectedWithdrawal = {
      'exchangeRate': '123.45',
      'recipient': '0x2000000000000000000000000000000000000000',
      'requestedToken': '10000000000000000000',
      'sentWei': '81004455245038477',
      'user': '0x2000000000000000000000000000000000000000',
    }
    assert.containSubset(wdRes.body, expectedWithdrawal)

    const wdGet = await app.withUser(recipient).request
      .get(`/custodial/withdrawals/${wdRes.body.id}`)
      .set(authHeaders).set('x-address', recipient)
      .send()
    assert.equal(wdGet.status, 200)
    assert.containSubset(wdGet.body, expectedWithdrawal)

    const wdListGet = await app.withUser(recipient).request
      .get(`/custodial/${recipient}/withdrawals`)
      .set(authHeaders).set('x-address', recipient)
      .send()
    assert.equal(wdListGet.status, 200)
    assert.containSubset(wdListGet.body[0], expectedWithdrawal)
    assert.equal(wdListGet.body.length, 1)
  })

  it("should work with these values specifically", async () => {
    const wdRes = await app.withUser(recipient).request
      .post(`/custodial/withdrawals`)
      .set(authHeaders).set('x-address', recipient)
      .send({ 
        recipient, 
        amountToken: "4016900000000000000000"
      })
    assert.equal(wdRes.status, 200)
    const expectedWithdrawal = {
      'exchangeRate': "123.45",
      'recipient': '0x2000000000000000000000000000000000000000',
      'requestedToken': '4016900000000000000000',
      'sentWei': '32538679627379505872',
      'user': '0x2000000000000000000000000000000000000000',
    }
    assert.containSubset(wdRes.body, expectedWithdrawal)

    const wdGet = await app.withUser(recipient).request
      .get(`/custodial/withdrawals/${wdRes.body.id}`)
      .set(authHeaders).set('x-address', recipient)
      .send()
    assert.equal(wdGet.status, 200)
    assert.containSubset(wdGet.body, expectedWithdrawal)

    const wdListGet = await app.withUser(recipient).request
      .get(`/custodial/${recipient}/withdrawals`)
      .set(authHeaders).set('x-address', recipient)
      .send()
    assert.equal(wdListGet.status, 200)
    assert.containSubset(wdListGet.body[0], expectedWithdrawal)
    assert.equal(wdListGet.body.length, 1)
  })
})

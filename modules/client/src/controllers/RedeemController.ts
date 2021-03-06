import { ethers as eth } from 'ethers'

import { Payment } from '../types'

import { AbstractController } from './AbstractController'

export class RedeemController extends AbstractController {
  public redeem = async (secret: string): Promise<{ purchaseId: string, amount: Payment }> => {
    // check that the secret was generated as a hex
    if (!eth.utils.isHexString(secret)) {
      throw new Error(`The secret provided is not a hex string. Secret: ${secret}`)
    }

    const state = this.getState()

    try {
      const { purchaseId, sync, amount } = await this.hub.redeem(
        secret,
        state.persistent.channel.txCountGlobal, state.persistent.lastThreadUpdateId,
      )
      this.connext.syncController.handleHubSync(sync)
      // get amount of purchase
      return { purchaseId, amount }
    } catch (e) {
      throw new Error(`Error redeeming payment with secret: ${secret}. ${e.message}`)
    }
  }
}

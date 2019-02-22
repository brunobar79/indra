import { maybe } from './util'
import { PaymentMetaDao } from "./dao/PaymentMetaDao";
import { PurchasePayment, convertThreadState, UpdateRequest, UpdateRequestBigNumber, PaymentArgs, convertPayment, PaymentArgsBigNumber, convertChannelState, PaymentArgsBN, ChannelStateUpdate, PurchasePaymentSummary, Payment, DepositArgs, convertDeposit } from "./vendor/connext/types";
import { assertUnreachable } from "./util/assertUnreachable";
import ChannelsService from "./ChannelsService";
import ThreadsService from "./ThreadsService";
import ChannelsDao from "./dao/ChannelsDao";
import Config from "./Config";
import { prettySafeJson } from "./util";
import { Big } from "./util/bigNumber";
import { Validator } from "./vendor/connext/validator";
import { SignerService } from "./SignerService";
import PaymentsDao from "./dao/PaymentsDao";
import { default as DBEngine } from './DBEngine'
import { PurchaseRowWithPayments, PurchasePaymentRow } from "./domain/Purchase";
import { default as log } from './util/log'
import { ChannelStateUpdateRow } from './domain/Channel';
import { emptyAddress } from './vendor/connext/Utils';

type MaybeResult<T> = (
  { error: true; msg: string } |
  { error: false; res: T }
)

const LOG = log('PaymentsService')

export default class PaymentsService {
  private channelsService: ChannelsService
  private threadsService: ThreadsService
  private signerService: SignerService
  private paymentsDao: PaymentsDao
  private paymentMetaDao: PaymentMetaDao
  private channelsDao: ChannelsDao
  private validator: Validator
  private config: Config
  private db: DBEngine

  constructor(
    channelsService: ChannelsService,
    threadsService: ThreadsService,
    signerService: SignerService,
    paymentsDao: PaymentsDao,
    paymentMetaDao: PaymentMetaDao,
    channelsDao: ChannelsDao,
    validator: Validator,
    config: Config,
    db: DBEngine,
  ) {
    this.channelsService = channelsService
    this.threadsService = threadsService
    this.signerService = signerService
    this.paymentsDao = paymentsDao
    this.paymentMetaDao = paymentMetaDao
    this.channelsDao = channelsDao
    this.validator = validator
    this.config = config
    this.db = db
  }

  public async doPurchase(
    user: string,
    meta: any,
    payments: PurchasePayment[],
  ): Promise<MaybeResult<{ purchaseId: string }>> {
    return this.db.withTransaction(() => this._doPurchase(user, meta, payments))
  }

  private async _doPurchase(
    user: string,
    meta: any,
    payments: PurchasePayment[],
  ): Promise<MaybeResult<{ purchaseId: string }>> {
    const purchaseId = this.generatePurchaseId()
    const custodialPayments: Array<{ user: string, payment: PurchasePayment, paymentId: number }> = []

    for (let payment of payments) {
      let row: { id?: number }
      let afterPayment = null

      if (payment.type == 'PT_CHANNEL') {
        // normal payment
        // TODO: should we check if recipient == hub here?
        row = await this.channelsService.doUpdateFromWithinTransaction(user, {
          args: payment.update.args,
          reason: 'Payment',
          sigUser: payment.update.sigUser,
          txCount: payment.update.txCount
        })

        // If the payment's recipient is not the hub, create an instant
        // custodial payment (but only after the row in `payments` has been
        // created, since the `custodial_payments` table references that row)
        if (payment.recipient !== this.config.hotWalletAddress) {
          afterPayment = paymentId => custodialPayments.push({ user, payment, paymentId })
        }

      } else if (payment.type == 'PT_THREAD') {
        row = await this.threadsService.update(
          user,
          payment.recipient,
          convertThreadState('bignumber', payment.update.state),
        )
      } else if (payment.type == 'PT_LINK') {
        if (payment.recipient != emptyAddress) {
          throw new Error(`Linked payments must have no recipient`)
        }

        if (!payment.secret) {
          throw new Error(`No secret detected on linked payment.`)
        }

        // update users channel
        row = await this.channelsService.doUpdateFromWithinTransaction(user, {
          args: payment.update.args,
          reason: 'Payment',
          sigUser: payment.update.sigUser,
          txCount: payment.update.txCount
        })

      } else {
        assertUnreachable(payment, 'invalid payment type: ' + (payment as any).type)
      }

      // Note: this handling of meta isn't ideal. In the future, we should have
      // a Purchase table to store the purchase metadata instead of merging it
      // into payment metadata.
      const paymentId = await this.paymentMetaDao.save(purchaseId, row.id, {
        recipient: payment.recipient,
        amount: payment.amount,
        secret: payment.secret,
        type: payment.type,
        meta: {
          ...meta,
          ...payment.meta,
        },
      })
      if (afterPayment)
        await afterPayment(paymentId)
    }

    for (let p of custodialPayments) {
      try {
        await this.doInstantCustodialPayment(p.payment, p.paymentId)
      } finally {
        // Check to see if collateral is needed, even if the tip failed
        const [res, err] = await maybe(this.channelsService.doCollateralizeIfNecessary(p.payment.recipient))
        if (err) {
          LOG.error(`Error recollateralizing ${p.payment.recipient}: ${'' + err}\n${err.stack}`)
        }
      }
    }

    return {
      error: false,
      res: { purchaseId }
    }
  }

  public async doRedeem(user: string, secret: string): Promise<MaybeResult<{ paymentRow: PurchasePaymentRow }>> {
    const channel = await this.channelsDao.getChannelOrInitialState(user)
    // channel checks
    if (channel.status !== 'CS_OPEN') {
      throw new Error('Channel is not open: ' + user)
    }

    const payment = await this.paymentMetaDao.getLinkedPayment(secret)
    // is user has channel, do payment, otherwise collateralize
    const prev = convertChannelState('bn', channel.state)
    const amt = convertPayment('bn', payment.amount)
    if (!this.validator.cantAffordFromBalance(prev, amt, "user")) {
      // hub can afford payment from existing channel balance
      // proceed with normal channel payment
      const row = await this.channelsService.doUpdateFromWithinTransaction(
        user, {
          args: { ...payment.amount, recipient: "user" },
          reason: 'Payment',
          txCount: prev.txCountGlobal + 1,
        }
      )
    } else {
      // propose a hub authorized update paying user in channel
      // directly, in addition to making a collateral deposit
      // if needed
      const collateralStr = await this.channelsService.getCollateralDepositArgs(user)
      const collateralDeposit = convertDeposit("bignumber", collateralStr)
      const finalDeposit = { 
        ...collateralDeposit, 
        depositWeiUser: payment.amount.amountWei,
        depositTokenUser: payment.amount.amountToken,
      }
      
      // sign the final deposit state, and save to redis
      await this.channelsService.redisSaveUnsignedState('hub-authorized', user, {
        args: finalDeposit,
        reason: 'ProposePendingDeposit'
      })
    }

    // mark the payment as redeemed by updating the recipient field
    const redeemedPaymentRow = await this.paymentMetaDao.redeemLinkedPayment(user, secret)

    // Check to see if collateral is needed
    // TODO: clean up collateralization on redemptions? or only with
    // additional usage
    const [res, err] = await maybe(this.channelsService.doCollateralizeIfNecessary(payment.recipient))
    if (err) {
      LOG.error(`Error recollateralizing ${payment.recipient}: ${'' + err}\n${err.stack}`)
    }

    return {
      error: false,
      res: { paymentRow: redeemedPaymentRow }
    }
  }

  public async doPurchaseById(id: string): Promise<PurchaseRowWithPayments> {
    const payments = await this.paymentMetaDao.byPurchase(id)
    if (!payments.length)
      return

    const totalAmount: Payment = {
      amountWei: '0',
      amountToken: '0',
    }
    for (let payment of payments) {
      totalAmount.amountWei = Big(totalAmount.amountWei).plus(payment.amount.amountWei).toFixed()
      totalAmount.amountToken = Big(totalAmount.amountToken).plus(payment.amount.amountToken).toFixed()
    }

    // TODO: this is a bit of a hack because we aren't totally tracking
    // purchases right now. In the future the `payments[0]` bits will be
    // replaced with an actual payments row.
    return {
      purchaseId: id,
      createdOn: payments[0].createdOn,
      sender: payments[0].sender,
      meta: { todo: 'this will be filled in later' },
      amount: totalAmount,
      payments,
    }
  }

  public async doInstantCustodialPayment(payment: PurchasePayment, paymentId: number): Promise<void> {
    const paymentUpdate = payment.update as UpdateRequest

    const recipientChannel = await this.channelsDao.getChannelByUser(payment.recipient)
    if (!recipientChannel) {
      throw new Error(`Hub to recipient channel does not exist, cannot forward payment, payment: ${prettySafeJson(payment)}`)
    }

    const paymentArgs = paymentUpdate.args as PaymentArgs
    if (paymentArgs.recipient !== 'hub') {
      throw new Error(`Payment must be signed to hub in order to forward, payment: ${prettySafeJson(payment)}`)
    }

    // Create the payment that will be sent to the recipient. It's identical to
    // the payment being made to the hub, except:
    // 1) it will be sent to to the recipient's channel, and
    // 2) the recipient is the user, not the hub
    const argsHubToRecipient = {...paymentArgs, recipient: 'user'} as PaymentArgs

    const unsignedStateHubToRecipient = this.validator.generateChannelPayment(
      convertChannelState('str', recipientChannel.state),
      argsHubToRecipient
    )
    const signedStateHubToRecipient = await this.signerService.signChannelState(unsignedStateHubToRecipient)
    const disbursement = await this.channelsDao.applyUpdateByUser(
      payment.recipient,
      'Payment',
      this.config.hotWalletAddress,
      signedStateHubToRecipient,
      argsHubToRecipient
    )

    // Link the payment (ie, the Payment row which references the
    // paying-user -> hub state update) to the disbursement.
    return await this.paymentsDao.createCustodialPayment(paymentId, disbursement.id)
  }

  private generatePurchaseId(
    prefix = '',
    len = 10,
    alphabet = null,
  ): string {
    let text = ''
    let possible =
      alphabet || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

    for (let i = 0; i < len; i++)
      text += possible.charAt(Math.floor(Math.random() * possible.length))

    return prefix + text
  }
}

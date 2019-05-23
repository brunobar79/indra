import * as express from 'express'
import { isArray } from 'util'

import PaymentProfilesService from '../PaymentProfilesService'
import { toBN } from '../util'
import log, { logApiRequestError } from '../util/log'
import { isServiceOrAdmin, isServiceOrAdminOrOwnedAddress } from '../util/ownedAddressOrAdmin'

import { ApiService } from './ApiService'

const LOG = log('PaymentProfilesApiService')

export default class PaymentProfilesApiService extends ApiService<
  PaymentProfilesApiServiceHandler
> {
  public namespace = 'profile'
  public routes = {
    'POST /add-profile/:key': 'doAddProfileKey',
    'POST /': 'doCreatePaymentProfile',
    'GET /:id': 'doGetPaymentProfileById',
    'GET /user/:user': 'doGetPaymentProfileByUser'
  }
  public handler = PaymentProfilesApiServiceHandler
  public dependencies = {
    paymentProfilesService: 'PaymentProfilesService'
  }
}

class PaymentProfilesApiServiceHandler {
  paymentProfilesService: PaymentProfilesService

  async doAddProfileKey(req: express.Request, res: express.Response) {
    if (!isServiceOrAdmin(req)) {
      res.status(403)
      return res.send({ error: 'Admin role not detected on request.' })
    }

    const { key } = req.params
    const { addresses } = req.body
    if (
      !key ||
      !Number.isInteger(parseInt(key)) ||
      !addresses ||
      !isArray(addresses)
    ) {
      logApiRequestError(LOG, req)
      return res.sendStatus(400)
    }

    await this.paymentProfilesService.doAddProfileKey(parseInt(key), addresses)
    return res.sendStatus(200)
  }

  async doCreatePaymentProfile(req: express.Request, res: express.Response) {
    if (!isServiceOrAdmin(req)) {
      res.status(403)
      return res.send({ error: 'Admin role not detected on request.' })
    }

    const {
      minimumMaintainedCollateralWei,
      minimumMaintainedCollateralToken,
      amountToCollateralizeWei,
      amountToCollateralizeToken
    } = req.body

    // TODO: right now the hub does not maintain collateral for wei
    // Do not error if these parameters are not detected
    // Do error if the parameters are non-zero
    if (
      // !minimumMaintainedCollateralWei ||
      !minimumMaintainedCollateralToken ||
      // !amountToCollateralizeWei ||
      !amountToCollateralizeToken
    ) {
      logApiRequestError(LOG, req)
      return res.sendStatus(400)
    }

    if (
      (minimumMaintainedCollateralWei &&
        !toBN(minimumMaintainedCollateralWei).isZero()) ||
      (amountToCollateralizeWei && !toBN(amountToCollateralizeWei).isZero())
    ) {
      logApiRequestError(LOG, req)
      return res.sendStatus(400)
    }

    const config = await this.paymentProfilesService.doCreatePaymentProfile({
      minimumMaintainedCollateralWei,
      minimumMaintainedCollateralToken,
      amountToCollateralizeWei,
      amountToCollateralizeToken
    })

    return res.send({ paymentProfileId: config.id })
  }

  async doGetPaymentProfileById(req: express.Request, res: express.Response) {
    if (!isServiceOrAdmin(req)) {
      res.status(403)
      return res.send({ error: 'Admin role not detected on request.' })
    }

    const { id } = req.params

    if (!id || !Number.isInteger(parseInt(id))) {
      logApiRequestError(LOG, req)
      return res.sendStatus(400)
    }

    const config = await this.paymentProfilesService.doGetPaymentProfileById(
      parseInt(id)
    )

    if (!config) {
      res.status(400)
      return res.send({ error: `No payment profile config found with id: ${id}` })
    }

    return res.send(config)
  }

  async doGetPaymentProfileByUser(req: express.Request, res: express.Response) {
    if (!isServiceOrAdminOrOwnedAddress(req)) {
      logApiRequestError(LOG, req)
      return res.sendStatus(400)
    }
    const { user } = req.params
    
    if (!user) {
      logApiRequestError(LOG, req)
      return res.sendStatus(400)
    }

    const config = await this.paymentProfilesService.doGetPaymentProfileByUser(
      user
    )

    if (!config) {
      res.status(400)
      return res.send({ error: `No payment profile config found for user: ${user}` })
    }

    return res.send(config)
  }
}

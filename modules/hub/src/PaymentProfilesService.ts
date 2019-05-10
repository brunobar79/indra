import { log } from "util";
import { types, big } from 'connext';
import PaymentProfilesDao from "./dao/PaymentProfilesDao";
import { Omit } from "react-redux";
import { prettySafeJson } from "./util";
const { Big, } = big
const {
  convertPaymentProfile
} = types
type Address = types.Address
type PaymentProfileConfig<T=string> = types.PaymentProfileConfig<T>

const LOG = log('PaymentProfilesService')

export default class PaymentProfilesService {

  constructor(
    private paymentProfilesDao: PaymentProfilesDao,
  ) {}

  public async doCreatePaymentProfile(config: Omit<PaymentProfileConfig, "id">): Promise<PaymentProfileConfig> {
    const {
      minimumMaintainedCollateralWei, 
      minimumMaintainedCollateralToken, 
      amountToCollateralizeWei, 
      amountToCollateralizeToken
    } = config
    // TODO: implement collateralization in wei
    if (
      minimumMaintainedCollateralWei && !Big(minimumMaintainedCollateralWei).isZero() ||
      amountToCollateralizeWei && !Big(amountToCollateralizeWei).isZero()
    ) {
      throw new Error(`Cannot support wei collateral requests at this time. Requested config: ${prettySafeJson(config)}`)
    }

    // check that the profile configurations requested are not negative
    if (
      Big(amountToCollateralizeToken).lte(0) || 
      Big(minimumMaintainedCollateralToken).lte(0)
    ) {
      throw new Error(`Negative or zero value collateralization parameters requested. Requested config: ${prettySafeJson(config)}`)
    }

    // no other checks performed, insert the payment profile
    const profile = await this.paymentProfilesDao.createPaymentProfile(
      convertPaymentProfile("bn", config)
    )

    if (!profile) {
      return null
    }

    return convertPaymentProfile("str", profile)
  }

  // NOTE: will fail if channel does not exist
  public async doAddProfileKey(key: number, addresses: Address[]) {
    if (addresses.length == 1) {
      await this.paymentProfilesDao.addPaymentProfileByUser(key, addresses[0])
      return
    }

    await this.paymentProfilesDao.addPaymentProfileByUsers(key, addresses)
  }

  public async doGetPaymentProfileById(id: number): Promise<PaymentProfileConfig> {
    const profile = await this.paymentProfilesDao.getPaymentProfileConfigById(id)
    if (!profile) {
      return null
    }

    return convertPaymentProfile("str", profile)
  }
}
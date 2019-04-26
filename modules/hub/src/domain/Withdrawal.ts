import { BN } from 'ethereumjs-util';

export enum WithdrawalStatus {
  NEW = 'NEW',
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED'
}

export default interface Withdrawal {
  id: number
  initiator: string
  recipient: string
  amountWei: BN
  amountUsd: BN
  txhash: string|null
  status: WithdrawalStatus
  createdAt: number
  confirmedAt: number|null
  failedAt: number|null
}

export function withdrawalToJson(wd: Withdrawal) {
  return {
    id: wd.id,
    recipient: wd.recipient,
    amountWei: wd.amountWei.toString(),
    amountUsd: wd.amountUsd.toString(),
    txhash: wd.txhash,
    status: wd.status.toString(),
    createdAt: wd.createdAt,
    confirmedAt: wd.confirmedAt,
    failedAt: wd.failedAt
  }
}

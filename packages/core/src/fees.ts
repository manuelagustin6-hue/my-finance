import type { FeeSchedule } from './types.ts';

export const NO_FEES: FeeSchedule = { percent: 0, fixed: 0, minimum: 0 };

/**
 * Calcula la comisión de una operación según el esquema de la billetera.
 * comisión = max(mínimo, monto × porcentaje / 100 + fijo). Si el monto es 0, no hay comisión.
 */
export function calculateFee(schedule: FeeSchedule, grossAmount: number): number {
  const gross = Math.abs(grossAmount);
  if (gross === 0) return 0;
  const variable = (gross * schedule.percent) / 100 + schedule.fixed;
  return roundTo(Math.max(schedule.minimum, variable), 8);
}

/** Costo efectivo de comprar `quantity` unidades a `price`, comisión incluida. */
export function totalBuyCost(schedule: FeeSchedule, quantity: number, price: number): number {
  const gross = quantity * price;
  return gross + calculateFee(schedule, gross);
}

/** Monto neto que se recibe al vender `quantity` unidades a `price`, descontada la comisión. */
export function netSellProceeds(schedule: FeeSchedule, quantity: number, price: number): number {
  const gross = quantity * price;
  return gross - calculateFee(schedule, gross);
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Exact decimal arithmetic for money and tonnage, so the mock gives the same
 * figures as the backend's Python `Decimal` (e.g. 691.20, not 691.2000000001).
 * A value is an integer `units` scaled by 10^-scale.
 */
export interface Decimal {
  units: bigint;
  scale: number;
}

const DECIMAL_PATTERN = /^(\d+)(?:\.(\d+))?$/;

export function parseDecimal(value: string): Decimal {
  const match = DECIMAL_PATTERN.exec(value);
  if (!match) throw new Error(`Not a non-negative decimal: "${value}"`);
  const fraction = match[2] ?? '';
  return { units: BigInt(`${match[1]}${fraction}`), scale: fraction.length };
}

export function fromInteger(value: number): Decimal {
  return { units: BigInt(value), scale: 0 };
}

function align(a: Decimal, b: Decimal): [bigint, bigint, number] {
  const scale = Math.max(a.scale, b.scale);
  return [
    a.units * 10n ** BigInt(scale - a.scale),
    b.units * 10n ** BigInt(scale - b.scale),
    scale,
  ];
}

export function add(a: Decimal, b: Decimal): Decimal {
  const [x, y, scale] = align(a, b);
  return { units: x + y, scale };
}

export function multiply(a: Decimal, b: Decimal): Decimal {
  return { units: a.units * b.units, scale: a.scale + b.scale };
}

/** Exact division by 10^power (kilograms → tons is power 3). */
export function shiftLeft(a: Decimal, power: number): Decimal {
  return { units: a.units, scale: a.scale + power };
}

export function isZero(a: Decimal): boolean {
  return a.units === 0n;
}

/** Round half up to `places` decimals, like Python's ROUND_HALF_UP. */
export function roundHalfUp(a: Decimal, places: number): Decimal {
  if (a.scale <= places) {
    return { units: a.units * 10n ** BigInt(places - a.scale), scale: places };
  }
  const divisor = 10n ** BigInt(a.scale - places);
  const quotient = a.units / divisor;
  const remainder = a.units % divisor;
  return {
    units: remainder * 2n >= divisor ? quotient + 1n : quotient,
    scale: places,
  };
}

/** Plain notation with trailing zeros dropped, keeping at least `minPlaces`. */
export function formatDecimal(a: Decimal, minPlaces = 0): string {
  let { units, scale } = a;
  while (scale > minPlaces && units % 10n === 0n) {
    units /= 10n;
    scale -= 1;
  }
  const digits = units.toString().padStart(scale + 1, '0');
  if (scale === 0) return digits;
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

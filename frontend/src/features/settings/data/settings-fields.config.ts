import type { Material } from '@/api';
import type { PriceField } from '@/features/settings/types/settings-form';

export const MATERIAL_LABELS: Record<Material, string> = {
  sand: 'Sand',
  stone: '13 mm stone',
  cement: 'Cement',
};

export const PRICE_FIELDS: { material: Material; field: PriceField }[] = [
  { material: 'sand', field: 'sand_price_per_ton' },
  { material: 'stone', field: 'stone_price_per_ton' },
  { material: 'cement', field: 'cement_price_per_ton' },
];

export const DECIMAL_HINT = 'Use a dot for decimals, e.g. 10.50';

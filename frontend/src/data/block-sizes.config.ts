import type { BlockSize } from '@/api/types';

/** §2.2 block dimensions, length × width × height in millimetres. */
export const BLOCK_SIZES: Record<
  BlockSize,
  { label: string; dimensions: string }
> = {
  full: { label: 'Full blocks', dimensions: '400 × 200 × 200 mm' },
  half: { label: 'Half blocks', dimensions: '200 × 200 × 200 mm' },
};

export const BLOCK_SIZE_ORDER: BlockSize[] = ['full', 'half'];

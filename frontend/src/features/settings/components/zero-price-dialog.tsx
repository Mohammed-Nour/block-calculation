import type { Material } from '@/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui';
import { MATERIAL_LABELS } from '@/features/settings/data/settings-fields.config';

interface ZeroPriceDialogProps {
  materials: Material[];
  onConfirm: () => void;
  onCancel: () => void;
}

/** §8.2: a zero price needs an explicit confirmation before it is saved. */
export function ZeroPriceDialog({
  materials,
  onConfirm,
  onCancel,
}: ZeroPriceDialogProps) {
  const names = materials
    .map((material) => MATERIAL_LABELS[material])
    .join(', ');
  return (
    <AlertDialog
      open={materials.length > 0}
      onOpenChange={(open) => !open && onCancel()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Save a zero price?</AlertDialogTitle>
          <AlertDialogDescription>
            {names} will cost 0 per ton, so new estimates will show no cost for{' '}
            {materials.length === 1 ? 'it' : 'them'}. Saved estimates keep their
            prices.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Go back and edit</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Save zero price
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

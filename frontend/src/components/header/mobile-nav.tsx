import { useState } from 'react';

import { NavLinks } from '@/components/header/nav-links';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-8 w-8"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-70 sm:w-80">
        <SheetHeader className="border-b pb-4">
          <SheetTitle className="flex items-center">
            <Logo />
          </SheetTitle>
        </SheetHeader>
        <NavLinks
          className="flex flex-col gap-2 py-4"
          onLinkClick={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

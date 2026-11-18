import { NavLinks } from '@/components/header/nav-links';
import { Logo } from '@/components/logo';
import { MobileNav } from '@/components/header/mobile-nav';

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="bl-container flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <MobileNav />
          <Logo />
          <NavLinks variant="inline" className="hidden md:flex" />
        </div>
      </div>
    </header>
  );
}

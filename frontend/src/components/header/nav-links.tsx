import { links } from '@/data';
import { NavLink } from '@/components/header/nav-link';
import { cn } from '@/lib';

interface NavLinksProps {
  className?: string;
  onLinkClick?: () => void;
  variant?: 'inline' | 'stacked';
}

export function NavLinks({
  className,
  onLinkClick,
  variant = 'stacked',
}: NavLinksProps) {
  const isInline = variant === 'inline';

  return (
    <nav
      className={cn(
        isInline ? 'flex items-center gap-2' : 'flex flex-col',
        className,
      )}
    >
      {links.map((link) => (
        <NavLink
          key={link.to}
          link={link}
          isInline={isInline}
          onClick={onLinkClick}
        />
      ))}
    </nav>
  );
}

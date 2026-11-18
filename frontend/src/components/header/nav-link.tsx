import { Link } from '@tanstack/react-router';
import type { links } from '@/data';

import { cn } from '@/lib';

type NavItem = (typeof links)[number];

interface NavLinkProps {
  link: NavItem;
  isInline: boolean;
  onClick?: () => void;
}

export function NavLink({ link, isInline, onClick }: NavLinkProps) {
  return (
    <Link
      to={link.to}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        isInline
          ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
          : 'mb-2 hover:bg-muted',
      )}
      activeProps={{
        className: cn(
          'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
          isInline
            ? 'bg-muted text-foreground'
            : 'mb-2 bg-primary text-primary-foreground',
        ),
      }}
      activeOptions={{ exact: true }}
    >
      <link.icon size={17} />
      {link.label}
    </Link>
  );
}

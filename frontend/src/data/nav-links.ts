import { FolderKanban, Plus, Settings } from 'lucide-react';

export const links = [
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/projects/new', label: 'New project', icon: Plus },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

import { Globe, Package, Smartphone, type LucideIcon } from 'lucide-react';

export const U3_STARTERS = ['u3f1', 'u3f2', 'u3f3'] as const;

export const U3_STARTER_ICONS: Record<(typeof U3_STARTERS)[number], LucideIcon> = {
  u3f1: Smartphone,
  u3f2: Globe,
  u3f3: Package,
};

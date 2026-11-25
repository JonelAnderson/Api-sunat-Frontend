import { MenuNavApiItem } from '@shared/models/menu-nav-api.interface';
import { NavigationItem } from '@shared/models/navigation-item.interface';

const NAV_TYPES = new Set(['item', 'collapse', 'group']);

function normalizeNavType(type: string | undefined): NavigationItem['type'] {
  const t = (type ?? 'item').toLowerCase();
  return NAV_TYPES.has(t) ? (t as NavigationItem['type']) : 'item';
}

/** Ensures routerLink targets live under the private shell. */
export function normalizePrivateRouteUrl(url: string | undefined): string | undefined {
  if (!url || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  const trimmed = url.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.startsWith('/private')) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    return `/private${trimmed}`;
  }
  return `/private/${trimmed}`;
}

export function mapMenuNavApiToNavigation(items: MenuNavApiItem[] | null | undefined): NavigationItem[] {
  if (!items?.length) {
    return [];
  }

  return items
    .map(mapSingle)
    .filter((item): item is NavigationItem => item !== null);
}

function mapSingle(source: MenuNavApiItem): NavigationItem | null {
  if (source.hidden) {
    return null;
  }

  const children = (source.children ?? [])
    .map(mapSingle)
    .filter((c): c is NavigationItem => c !== null);

  const item: NavigationItem = {
    id: String(source.id),
    title: source.title,
    type: normalizeNavType(source.type),
    translate: source.translate,
    icon: source.icon,
    hidden: source.hidden,
    url: normalizePrivateRouteUrl(source.url),
    classes: source.classes,
    exactMatch: source.exactMatch,
    external: source.external,
    target: source.target,
    breadcrumbs: source.breadcrumbs,
    disabled: source.disabled,
    children: children.length ? children : undefined
  };

  if (source.badgeTitle) {
    item.badge = {
      title: source.badgeTitle,
      type: source.badgeType ?? 'label label-primary'
    };
  }

  return item;
}

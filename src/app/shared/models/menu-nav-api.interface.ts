/** Shape returned by GET v1/Menu/Nav (camelCase JSON). */
export interface MenuNavApiItem {
  id: number;
  title: string;
  type: string;
  translate?: string;
  icon?: string;
  hidden?: boolean;
  url?: string;
  classes?: string;
  exactMatch?: boolean;
  external?: boolean;
  target?: boolean;
  breadcrumbs?: boolean;
  badgeTitle?: string;
  badgeType?: string;
  disabled?: boolean;
  order?: number;
  children?: MenuNavApiItem[];
}

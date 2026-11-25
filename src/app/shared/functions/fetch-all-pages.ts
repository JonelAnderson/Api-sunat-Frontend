import { EMPTY, Observable } from 'rxjs';
import { expand, map, reduce } from 'rxjs/operators';
import { BaseResponse } from '@shared/models/base-api-response.interface';

/** The API returns at most 50 rows per page (BasePaginationRequest.Records): asking for more still gives 50. */
export const MAX_PAGE_SIZE = 50;

/**
 * Every row of a paged list, for a screen that needs all of them (not a list-table): asks page after page
 * (0-based index, 50 rows) until the server's totalRecords. For a combo / selector over many rows, use a Lookup endpoint instead.
 */
export function fetchAllPages<T>(getPage: (pageIndex: number, size: number) => Observable<BaseResponse>, size = MAX_PAGE_SIZE): Observable<T[]> {
  return getPage(0, size).pipe(
    map((r) => ({ r, page: 0 })),
    expand(({ r, page }) =>
      r.succeeded && Array.isArray(r.data) && r.data.length === size && (page + 1) * size < (r.totalRecords ?? 0)
        ? getPage(page + 1, size).pipe(map((next) => ({ r: next, page: page + 1 })))
        : EMPTY
    ),
    reduce((all, { r }) => all.concat((Array.isArray(r.data) ? r.data : []) as T[]), [] as T[])
  );
}

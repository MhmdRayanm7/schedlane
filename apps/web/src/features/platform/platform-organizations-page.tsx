import { RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/shared/components/ui/button";
import { usePlatformOrganizations } from "./hooks/use-platform";
import styles from "./platform.module.css";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );

function State({
  active,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <span className={styles.lifecycle} data-active={active}>
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

export function PlatformOrganizationsPage() {
  const query = usePlatformOrganizations();
  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Platform directory</p>
          <h1>Organizations</h1>
          <p>Read-only lifecycle and ownership visibility across Schedlane.</p>
        </div>
      </header>
      {query.isPending ? (
        <p className={styles.queryState}>Loading organizations…</p>
      ) : null}
      {query.isError ? (
        <div className={styles.queryState}>
          <p>We couldn't load organizations.</p>
          <Button onClick={() => void query.refetch()} variant="outline">
            <RefreshCw aria-hidden="true" /> Try again
          </Button>
        </div>
      ) : null}
      {!query.isPending && !query.isError && items.length === 0 ? (
        <div className={styles.empty}>
          <h2>No organizations yet</h2>
          <p>Approved workspace requests will appear here.</p>
        </div>
      ) : null}
      {items.length > 0 ? (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Organization</th>
                <th>Owner</th>
                <th>Created</th>
                <th>Publication</th>
                <th>Bookings</th>
                <th>Suspension</th>
                <th>Archive</th>
              </tr>
            </thead>
            <tbody>
              {items.map((organization) => (
                <tr key={organization.id}>
                  <td>
                    <strong>{organization.name}</strong>
                    <small>/book/{organization.slug}</small>
                  </td>
                  <td>
                    {organization.owner ? (
                      <>
                        <span>{organization.owner.name}</span>
                        <small>{organization.owner.email}</small>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{formatDate(organization.createdAt)}</td>
                  <td>
                    <State
                      active={Boolean(organization.publishedAt)}
                      activeLabel="Published"
                      inactiveLabel="Unpublished"
                    />
                  </td>
                  <td>
                    <State
                      active={!organization.publicBookingPaused}
                      activeLabel="Open"
                      inactiveLabel="Paused"
                    />
                  </td>
                  <td>
                    <State
                      active={!organization.suspendedAt}
                      activeLabel="Active"
                      inactiveLabel="Suspended"
                    />
                  </td>
                  <td>
                    <State
                      active={!organization.archivedAt}
                      activeLabel="Active"
                      inactiveLabel="Archived"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {query.hasNextPage ? (
        <div className={styles.loadMore}>
          <Button
            loading={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
            variant="outline"
          >
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}

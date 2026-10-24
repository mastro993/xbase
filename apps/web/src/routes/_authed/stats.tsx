import { createFileRoute } from '@tanstack/react-router';
import { FullWidthPage } from '@/features/shell/FullWidthPage';
import { StatsEmptyState } from '@/features/stats/StatsEmptyState';

export const Route = createFileRoute('/_authed/stats')({
  head: () => ({ meta: [{ title: 'Stats · XBase' }] }),
  component: StatsPage,
});

function StatsPage() {
  return (
    <FullWidthPage title="Stats" description="How your posts perform on X." width="5xl">
      <StatsEmptyState />
    </FullWidthPage>
  );
}

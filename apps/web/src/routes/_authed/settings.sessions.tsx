import { createFileRoute } from '@tanstack/react-router';
import { SessionsCard } from '@/features/settings/SessionsCard';

export const Route = createFileRoute('/_authed/settings/sessions')({
  head: () => ({ meta: [{ title: 'Sessions · Settings · XBase' }] }),
  component: SessionsPage,
});

function SessionsPage() {
  return <SessionsCard />;
}

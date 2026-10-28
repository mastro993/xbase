import { ChatSearchIcon } from '@hugeicons/core-free-icons';
import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { EmptyState } from '@/features/shell/EmptyState';

const discover = getRouteApi('/_authed/discover');

export const Route = createFileRoute('/_authed/discover/')({
  component: NoSearchOpen,
});

function NoSearchOpen() {
  const empty = discover.useLoaderData().length === 0;
  return (
    <div className="p-6">
      <EmptyState
        icon={ChatSearchIcon}
        title={empty ? 'Find posts worth replying to' : 'Pick a saved search'}
        description={
          empty
            ? 'Save the X searches you’d run by hand: topics, phrases, people. A discovery run reads them and your home timeline, and lists fresh posts here.'
            : 'See its query, when it last ran, and the candidates it found.'
        }
      />
    </div>
  );
}

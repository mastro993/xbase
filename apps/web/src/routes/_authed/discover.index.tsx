import { RiCompass3Line } from '@remixicon/react';
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
        icon={RiCompass3Line}
        title={empty ? 'Find posts worth replying to' : 'Pick a saved search'}
        description={
          empty
            ? 'Save the X searches you’d run by hand: topics, phrases, people. Once XBase is connected to the X API, it runs them and lists fresh posts here.'
            : 'See its query, edit it, or run it on X for now.'
        }
      />
    </div>
  );
}

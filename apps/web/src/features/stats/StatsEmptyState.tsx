import { CalendarClockIcon, ChartLineIcon, PercentIcon } from '@hugeicons/core-free-icons';
import { IconGlyph, type IconReference } from '@xbase/ui/utils/icon';
import { ButtonRouterLink } from '@/features/shell/router-links';
import { SectionCard } from '@/features/shell/SectionCard';

const PLANNED: { icon: IconReference; title: string; description: string }[] = [
  {
    icon: PercentIcon,
    title: 'Engagement rate',
    description:
      'Replies, reposts, likes and bookmarks per impression, for each post and over time.',
  },
  {
    icon: CalendarClockIcon,
    title: 'Best times to post',
    description:
      'A heatmap of weekdays by hour, in your time zone, showing when your posts do best.',
  },
  {
    icon: ChartLineIcon,
    title: 'Follower growth',
    description: 'Your follower count day by day, next to what you posted.',
  },
];

/** What Stats will show once XBase reads your numbers from the X API. */
export function StatsEmptyState() {
  return (
    <SectionCard
      title="Stats arrive with the X API"
      description="XBase isn’t connected to X yet. Once it reads your posts’ numbers through your own X developer app, this page shows:"
      hint="Until then, write and schedule your posts in Drafts."
      actions={
        <ButtonRouterLink to="/drafts" variant="secondary">
          Open Drafts
        </ButtonRouterLink>
      }
    >
      <ul className="grid gap-6 sm:grid-cols-3">
        {PLANNED.map(({ icon, title, description }) => (
          <li key={title} className="flex flex-col gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-background-secondary-default">
              <IconGlyph
                icon={icon}
                aria-hidden
                className="size-5 text-foreground-icon-secondary"
              />
            </span>
            <h3 className="text-body-medium text-text-primary">{title}</h3>
            <p className="text-body-regular text-text-secondary">{description}</p>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

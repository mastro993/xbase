import { Add01Icon } from '@hugeicons/core-free-icons';
import { ButtonRouterLink } from '@/features/shell/router-links';

/**
 * Opens /drafts/new, which creates an empty draft and opens it. A link rather than a server call,
 * so the unsaved-changes prompt asks before anything is created, and Keep editing creates nothing.
 */
export function NewDraftButton({ size = 'medium' }: { size?: 'small' | 'medium' }) {
  return (
    <ButtonRouterLink to="/drafts/new" size={size} leadingIcon={Add01Icon}>
      New draft
    </ButtonRouterLink>
  );
}

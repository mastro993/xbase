import { createLink } from '@tanstack/react-router';
import { ButtonLink } from '@xbase/ui/components/base/buttons/button';
import { IconLinkButton } from '@xbase/ui/components/base/buttons/icon-button';
import { LinkButton } from '@xbase/ui/components/base/buttons/link-button';

// BoardUI's link-shaped buttons render plain <a>s, which React Aria's RouterProvider doesn't
// reach. As TanStack links they keep typed `to` and `params`, preload on intent, navigate
// client-side, and mark the current page with data-status="active" and aria-current="page".

/** BoardUI's ButtonLink: `<ButtonRouterLink to="/drafts/new" leadingIcon={RiAddLine}>`. */
export const ButtonRouterLink = createLink(ButtonLink);

/** BoardUI's IconLinkButton: `icon` and `aria-label` are required. */
export const IconButtonRouterLink = createLink(IconLinkButton);

/** BoardUI's LinkButton, an inline text link: `<LinkButtonRouterLink to="/settings">`. */
export const LinkButtonRouterLink = createLink(LinkButton);

/** A photo, or a video's thumbnail. */
export interface PostImage {
  url: string; // https://pbs.twimg.com/…, sized for a vision model
  alt: string; // "" when X shows none
  video: boolean;
}

export interface Post {
  author: string; // "@handle" or ""
  text: string; // post text, emoji included (img alt)
  images: PostImage[]; // the post's own media, not the quoted post's
  truncated: boolean; // "Show more" present
  quoted: Post | null; // the post it quotes; a quoted post never has one
}

/** The post being replied to, with the conversation the page shows around it. */
export interface TargetPost extends Post {
  earlier: Post[]; // posts above it in the conversation, oldest first
  later: Post[]; // its author's posts right below it: the rest of their thread
}

/** Reply composer actions. `reply` drafts into an empty box; the others rewrite the box's text. */
export const ACTIONS = ['reply', 'polish', 'punchier', 'match-style'] as const;
export type ActionId = (typeof ACTIONS)[number];

/** Style guide sections, in form and prompt order. Every section is optional. */
export const STYLE_FIELDS = ['persona', 'audience', 'voice', 'rules'] as const;
export type StyleField = (typeof STYLE_FIELDS)[number];
export type StyleGuide = Record<StyleField, string>;
/** A style guide nobody filled in. */
export const EMPTY_STYLE: StyleGuide = { persona: '', audience: '', voice: '', rules: '' };

/** Something the user built, which the AI may mention. `id` only keys the settings list. */
export interface Project {
  id: string;
  name: string;
  description: string;
  link: string;
}
export type ProjectField = Exclude<keyof Project, 'id'>;

/** The user's style guide and projects: what every prompt knows about them. */
export interface Profile {
  style: StyleGuide;
  projects: Project[];
}

export const MAX_STYLE_FIELD_LENGTH = 1000;
export const MAX_PROJECTS = 10;
export const MAX_PROJECT_FIELD_LENGTH: Record<ProjectField, number> = {
  name: 60,
  description: 300,
  link: 200,
};

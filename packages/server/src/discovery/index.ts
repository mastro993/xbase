// One discovery run, and what the owner decides about each candidate it stored. The page's
// manual run calls these; #16 will schedule the run.

export { runDiscovery } from './fetch';
export { markCandidateReplied, muteCandidateAuthor, skipCandidate } from './memory';

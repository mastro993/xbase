import { useRef, useState } from 'react';

/** One post of the thread being edited. `key` keeps React's fields stable across removals. */
type ThreadPart = { key: string; text: string };

/** The composer's texts. Keys are p0, p1… so the server and the browser render the same ones. */
export function useThreadParts(initial: readonly string[]) {
  const nextKey = useRef(initial.length);
  const [parts, setParts] = useState<ThreadPart[]>(() =>
    initial.map((text, index) => ({ key: `p${index}`, text })),
  );

  return {
    parts,
    setText: (key: string, text: string) =>
      setParts((current) => current.map((part) => (part.key === key ? { ...part, text } : part))),
    /** Appends an empty part and returns its key. */
    add: () => {
      const key = `p${nextKey.current++}`;
      setParts((current) => [...current, { key, text: '' }]);
      return key;
    },
    remove: (key: string) => setParts((current) => current.filter((part) => part.key !== key)),
  };
}

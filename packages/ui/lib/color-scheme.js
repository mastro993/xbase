// Puts BoardUI's `dark` class on <html> while the OS uses a dark colour scheme, and follows it when
// it changes. Run it as a classic, blocking script in <head>, so the class is set before the first
// paint: inline on the website, as a file in the extension (MV3 forbids inline scripts there).
(() => {
  const query = matchMedia('(prefers-color-scheme: dark)');
  const apply = () => document.documentElement.classList.toggle('dark', query.matches);
  apply();
  query.addEventListener('change', apply);
})();

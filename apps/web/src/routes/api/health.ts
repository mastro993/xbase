import { createFileRoute } from '@tanstack/react-router';
import { json } from '@/server/http';

// Public: Docker's HEALTHCHECK and the boot warm-up call it.
export const Route = createFileRoute('/api/health')({
  server: { handlers: { GET: () => json({ ok: true }) } },
});

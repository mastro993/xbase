import { createFileRoute } from '@tanstack/react-router';
import { buttonVariants } from 'panelui-web/button';
import { Card } from 'panelui-web/card';

export const Route = createFileRoute('/')({ component: Home });

const EXTENSION_URL = 'https://github.com/mastro993/x-companion';

function Home() {
  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold tracking-tight">XBase</h1>
        <p className="text-lg text-muted-foreground">Tools for writing on X in your own voice.</p>
      </header>
      <Card>
        <Card.Header>
          <Card.Title>x-companion</Card.Title>
          <Card.Description>
            A Chromium extension that drafts replies and refines posts on X in your writing style,
            with your own AI key. It never posts for you.
          </Card.Description>
        </Card.Header>
        <Card.Footer>
          <a href={EXTENSION_URL} className={buttonVariants()}>
            Get the extension
          </a>
        </Card.Footer>
      </Card>
    </main>
  );
}

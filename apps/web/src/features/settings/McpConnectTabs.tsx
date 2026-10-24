import { Tab, TabList, TabPanel, Tabs } from '@xbase/ui/components/base/tabs/tabs';
import type { ReactNode } from 'react';
import { CopyField } from './CopyField';
import { claudeCodeCommand } from './mcp-url';

function Steps({ children }: { children: ReactNode }) {
  return (
    <ol className="flex list-decimal flex-col gap-1.5 ps-5 text-body-regular text-text-primary">
      {children}
    </ol>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-body-regular text-text-secondary">{children}</p>;
}

const PANEL = 'flex flex-col gap-3';

/** Short connect steps per client; the README's MCP section has the long version. */
export function McpConnectTabs({ mcpUrl }: { mcpUrl: string }) {
  return (
    <Tabs defaultSelectedKey="claude">
      <TabList aria-label="How to connect">
        <Tab id="claude">Claude</Tab>
        <Tab id="claude-code">Claude Code</Tab>
        <Tab id="other">Other clients</Tab>
      </TabList>
      <TabPanel id="claude" className={PANEL}>
        <Steps>
          <li>
            In Claude (web, desktop or mobile), open <strong>Settings → Connectors</strong> and
            choose <strong>Add custom connector</strong>.
          </li>
          <li>
            Name it XBase, paste the server URL, and leave the OAuth client ID and secret empty.
          </li>
          <li>
            Choose <strong>Connect</strong>, then <strong>Approve</strong> on XBase’s consent page.
          </li>
        </Steps>
        <Note>
          Claude connects from Anthropic’s servers, so XBase must be reachable on the internet over
          HTTPS.
        </Note>
      </TabPanel>
      <TabPanel id="claude-code" className={PANEL}>
        <CopyField
          label="Run in a terminal"
          value={claudeCodeCommand(mcpUrl)}
          copyLabel="Copy command"
        />
        <Steps>
          <li>
            In Claude Code, run <code className="font-mono">/mcp</code> and pick{' '}
            <code className="font-mono">xbase</code>.
          </li>
          <li>
            Sign in to XBase in the browser that opens, then choose <strong>Approve</strong>.
          </li>
        </Steps>
      </TabPanel>
      <TabPanel id="other" className={PANEL}>
        <Steps>
          <li>
            Add a remote MCP server of type <strong>Streamable HTTP</strong> (sometimes called{' '}
            <code className="font-mono">http</code>) with the server URL.
          </li>
          <li>The client registers itself and opens XBase’s consent page: choose Approve.</li>
        </Steps>
        <Note>
          Works with clients that sign in with OAuth, such as Cursor and VS Code. XBase doesn’t hand
          out client secrets.
        </Note>
      </TabPanel>
    </Tabs>
  );
}

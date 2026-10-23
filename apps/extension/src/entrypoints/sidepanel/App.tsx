import { Tabs } from 'panelui-web/tabs';
import { ProjectsTab } from '@/components/sidepanel/ProjectsTab';
import { ProviderTab } from '@/components/sidepanel/ProviderTab';
import { StatusHeader } from '@/components/sidepanel/StatusHeader';
import { StyleTab } from '@/components/sidepanel/StyleTab';
import { useSettings } from '@/hooks/use-settings';
import { getStatus } from '@/lib/settings';

export default function App() {
  const settings = useSettings();
  if (!settings) return null; // a local storage read; too brief to show a loader

  return (
    <div className="flex min-h-svh min-w-0 flex-col">
      <StatusHeader status={getStatus(settings)} />
      <Tabs variant="underline" defaultValue="provider" className="p-4">
        <Tabs.List>
          <Tabs.Trigger value="provider" className="flex-1">
            Provider
          </Tabs.Trigger>
          <Tabs.Trigger value="style" className="flex-1">
            Style
          </Tabs.Trigger>
          <Tabs.Trigger value="projects" className="flex-1">
            Projects
          </Tabs.Trigger>
        </Tabs.List>
        {/* Stays mounted so the model list and open key forms survive tab switches.
            Style and Projects unmount on purpose: that flushes their pending edits. */}
        <Tabs.Content value="provider" keepMounted>
          <ProviderTab settings={settings} />
        </Tabs.Content>
        <Tabs.Content value="style">
          <StyleTab settings={settings} />
        </Tabs.Content>
        <Tabs.Content value="projects">
          <ProjectsTab settings={settings} />
        </Tabs.Content>
      </Tabs>
    </div>
  );
}

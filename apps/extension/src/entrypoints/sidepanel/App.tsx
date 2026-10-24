import { Tab, TabList, TabPanel, Tabs } from '@xbase/ui/components/base/tabs/tabs';
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
      <Tabs defaultSelectedKey="provider" className="p-4">
        <TabList aria-label="Settings">
          <Tab id="provider" className="flex-1 justify-center">
            Provider
          </Tab>
          <Tab id="style" className="flex-1 justify-center">
            Style
          </Tab>
          <Tab id="projects" className="flex-1 justify-center">
            Projects
          </Tab>
        </TabList>
        {/* Stays mounted so the model list and open key forms survive tab switches. React Aria
            only makes it inert while another tab is open, so hide it too. Style and Projects
            unmount on purpose: that flushes their pending edits. */}
        <TabPanel id="provider" shouldForceMount className="data-inert:hidden">
          <ProviderTab settings={settings} />
        </TabPanel>
        <TabPanel id="style">
          <StyleTab settings={settings} />
        </TabPanel>
        <TabPanel id="projects">
          <ProjectsTab settings={settings} />
        </TabPanel>
      </Tabs>
    </div>
  );
}

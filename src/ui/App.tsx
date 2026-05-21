import { Viewport } from './Viewport';
import { ControlPanel } from './ControlPanel';
import { ExportPanel } from './ExportPanel';
import { Timeline } from '../timeline/Timeline';

export function App() {
  return (
    <div className="app">
      <ControlPanel />
      <Viewport />
      <ExportPanel />
      <div className="timeline-panel">
        <Timeline />
      </div>
    </div>
  );
}

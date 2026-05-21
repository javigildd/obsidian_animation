import { Viewport } from './Viewport';
import { ControlPanel } from './ControlPanel';
import { ExportPanel } from './ExportPanel';
import { SessionsPanel } from './SessionsPanel';
import { Timeline } from '../timeline/Timeline';

export function App() {
  return (
    <div className="app">
      <ControlPanel />
      <Viewport />
      <div className="panel panel-right">
        <SessionsPanel />
        <ExportPanel />
      </div>
      <div className="timeline-panel">
        <Timeline />
      </div>
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { useTimeline } from '../timeline/store';
import {
  listSessions,
  saveSession,
  overwriteSession,
  deleteSession,
  renameSession,
  parseSessionFromJson,
  Session,
  SessionData,
} from '../sessions/sessions';

export function SessionsPanel() {
  const [sessions, setSessions] = useState<Session[]>(() => listSessions());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const exportSnapshot = useTimeline((s) => s.exportSnapshot);
  const loadSnapshot = useTimeline((s) => s.loadSnapshot);

  const refresh = () => setSessions(listSessions());

  // Refresh whenever the tab regains focus (other tabs might have changed it).
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const handleSaveNew = () => {
    const defaultName = `Session ${sessions.length + 1}`;
    const name = prompt('Name this session:', defaultName);
    if (!name) return;
    saveSession(name, exportSnapshot());
    refresh();
  };

  const handleOverwrite = (s: Session) => {
    if (!confirm(`Overwrite "${s.name}" with the current state?`)) return;
    overwriteSession(s.id, exportSnapshot());
    refresh();
  };

  const handleLoad = (s: Session) => {
    if (!confirm(`Load "${s.name}"? This replaces the current timeline.`)) return;
    loadSnapshot(s.data);
  };

  const handleDelete = (s: Session) => {
    if (!confirm(`Delete "${s.name}"? This cannot be undone.`)) return;
    deleteSession(s.id);
    refresh();
  };

  const commitRename = (id: string) => {
    const name = renameValue.trim();
    if (name) renameSession(id, name);
    setRenamingId(null);
    setRenameValue('');
    refresh();
  };

  const handleExportJson = () => {
    const snap = exportSnapshot();
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `obsidian-graph-session-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleImportJson = async (file: File) => {
    const text = await file.text();
    const data = parseSessionFromJson(text);
    if (!data) {
      alert("That file doesn't look like a valid session JSON.");
      return;
    }
    const name = prompt('Save the imported session as:', file.name.replace(/\.json$/i, ''));
    if (!name) {
      // Loaded into timeline but not stored.
      loadSnapshot(data);
      return;
    }
    saveSession(name, data);
    loadSnapshot(data);
    refresh();
  };

  return (
    <div className="section">
      <h3 className="section-title">Sessions</h3>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={handleSaveNew} className="primary" style={{ flex: 1 }}>
          Save current as…
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button onClick={handleExportJson} style={{ flex: 1 }} title="Download current state as JSON">
          Export JSON
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{ flex: 1 }}
          title="Load a session from a JSON file"
        >
          Import JSON
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImportJson(f);
            e.target.value = '';
          }}
        />
      </div>

      <div className="session-list">
        {sessions.length === 0 && (
          <p className="muted" style={{ marginTop: 10 }}>
            No saved sessions yet. Save the current one above.
          </p>
        )}
        {sessions.map((s) => {
          const isRenaming = renamingId === s.id;
          return (
            <div key={s.id} className="session-row">
              <div className="session-info" style={{ flex: 1, minWidth: 0 }}>
                {isRenaming ? (
                  <input
                    autoFocus
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => commitRename(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(s.id);
                      else if (e.key === 'Escape') {
                        setRenamingId(null);
                        setRenameValue('');
                      }
                    }}
                    style={{ width: '100%' }}
                  />
                ) : (
                  <div
                    className="session-name"
                    title="Double-click to rename"
                    onDoubleClick={() => {
                      setRenamingId(s.id);
                      setRenameValue(s.name);
                    }}
                  >
                    {s.name}
                  </div>
                )}
                <div className="muted session-date">
                  {new Date(s.createdAt).toLocaleString()} · {summarize(s.data)}
                </div>
              </div>
              <div className="session-actions">
                <button onClick={() => handleLoad(s)} title="Replace the current timeline with this session">
                  Load
                </button>
                <button onClick={() => handleOverwrite(s)} title="Overwrite this session with the current state">
                  Save
                </button>
                <button
                  onClick={() => handleDelete(s)}
                  className="danger"
                  title="Delete this session"
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function summarize(d: SessionData): string {
  const keyCount = Object.values(d.tracks).reduce((n, list) => n + list.length, 0);
  return `${d.duration.toFixed(1)}s · ${d.fps}fps · ${keyCount} keys`;
}

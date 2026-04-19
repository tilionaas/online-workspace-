import { useState } from 'react';
import JoinScreen    from './components/JoinScreen.jsx';
import WorkspaceApp  from './components/WorkspaceApp.jsx';
import './App.css';

export default function App() {
  const [session, setSession] = useState(null);

  if (!session) {
    return (
      <JoinScreen
        onJoin={({ username, status, stream, hasCamera }) =>
          setSession({ username, status, stream, hasCamera })
        }
      />
    );
  }

  return (
    <WorkspaceApp
      username={session.username}
      status={session.status}
      stream={session.stream}
      hasCamera={session.hasCamera}
      onLeave={() => setSession(null)}
    />
  );
}

import { useState, useRef, useEffect } from 'react';
import './ChatPanel.css';

export default function ChatPanel({
  socket,
  currentRoom,
  roomMessages,
  generalMessages,
  username,
  status,
}) {
  const [tab,         setTab]         = useState('room');   // 'room' | 'general'
  const [collapsed,   setCollapsed]   = useState(false);
  const [mutedRoom,   setMutedRoom]   = useState(false);
  const [mutedGeneral,setMutedGeneral]= useState(false);
  const [input,       setInput]       = useState('');
  const bottomRef = useRef(null);

  const messages = tab === 'room' ? roomMessages : generalMessages;
  const isMuted  = tab === 'room' ? mutedRoom : mutedGeneral;

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function send(e) {
    e.preventDefault();
    const msg = input.trim();
    if (!msg || !socket) return;

    if (tab === 'room') {
      if (!currentRoom) return;
      socket.emit('chat:room', { message: msg });
    } else {
      socket.emit('chat:general', { message: msg });
    }
    setInput('');
  }

  function toggleMute() {
    if (tab === 'room')    setMutedRoom(v => !v);
    else                   setMutedGeneral(v => !v);
  }

  const roomLabel = currentRoom
    ? `#${currentRoom}`
    : '#lobby (hallway)';

  return (
    <aside className={`chat-panel${collapsed ? ' collapsed' : ''}`}>
      {/* Toggle button */}
      <button className="chat-toggle" onClick={() => setCollapsed(v => !v)} title="Toggle chat">
        {collapsed ? '💬' : '✕'}
      </button>

      {!collapsed && (
        <>
          {/* Header */}
          <div className="chat-header">
            <div className="chat-tabs">
              <button
                className={`chat-tab${tab === 'room' ? ' active' : ''}`}
                onClick={() => setTab('room')}
              >
                Room
                {roomMessages.length > 0 && <span className="badge">{roomMessages.length}</span>}
              </button>
              <button
                className={`chat-tab${tab === 'general' ? ' active' : ''}`}
                onClick={() => setTab('general')}
              >
                General
              </button>
            </div>
            <button
              className={`mute-btn${isMuted ? ' muted' : ''}`}
              onClick={toggleMute}
              title={isMuted ? 'Unmute chat' : 'Mute chat'}
            >
              {isMuted ? '🔕' : '🔔'}
            </button>
          </div>

          {/* Room label */}
          {tab === 'room' && (
            <div className="chat-room-label">{roomLabel}</div>
          )}

          {/* Messages */}
          <div className="chat-messages">
            {isMuted ? (
              <p className="chat-muted">Chat muted</p>
            ) : messages.length === 0 ? (
              <p className="chat-empty">
                {tab === 'room' && !currentRoom
                  ? 'Enter a room to chat with people inside it.'
                  : 'No messages yet. Say something!'}
              </p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className="chat-msg">
                  <span className="msg-user">{m.username}</span>
                  {m.status && <span className="msg-status">{m.status}</span>}
                  <p className="msg-text">{m.message}</p>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form className="chat-input-row" onSubmit={send}>
            <input
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                tab === 'room' && !currentRoom
                  ? 'Enter a room to chat…'
                  : 'Message…'
              }
              disabled={tab === 'room' && !currentRoom}
              maxLength={400}
            />
            <button
              type="submit"
              className="chat-send"
              disabled={!input.trim() || (tab === 'room' && !currentRoom)}
            >
              ↑
            </button>
          </form>
        </>
      )}
    </aside>
  );
}

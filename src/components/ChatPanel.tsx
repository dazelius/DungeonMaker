import { useState, useRef, useEffect, useCallback } from 'react';
import { useEditor } from '../store';
import { requestLevelAction, type ChatMessage } from '../services/anthropicChat';
import { executeActions } from '../services/actionExecutor';
import { placeRoom } from '../services/proceduralPlacer';

const API_KEY_STORAGE = 'graybox-anthropic-key';

interface DisplayMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
}

export function ChatPanel() {
  const chatOpen = useEditor((s) => s.chatOpen);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) ?? '');
  const [showKey, setShowKey] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([
    { role: 'system', text: 'AI 레벨 디자인 어시스턴트입니다.\n오브젝트 생성/수정/삭제를 자유롭게 요청하세요.\n예: "10x10 아레나 방 만들어줘" / "Starting Chamber 색 바꿔줘" / "램프 추가해서 2층 연결해줘"' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const chatHistoryRef = useRef<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages, statusText]);

  useEffect(() => {
    if (chatOpen) inputRef.current?.focus();
  }, [chatOpen]);

  const saveKey = useCallback((key: string) => {
    setApiKey(key);
    try { localStorage.setItem(API_KEY_STORAGE, key); } catch { /* ignore */ }
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    if (!apiKey) {
      setMessages((m) => [...m, { role: 'system', text: 'API 키를 먼저 입력하세요.' }]);
      return;
    }

    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    setLoading(true);
    setStatusText('AI가 레벨을 분석 중...');

    chatHistoryRef.current.push({ role: 'user', content: text });

    try {
      setStatusText('AI가 설계 중...');
      const response = await requestLevelAction(apiKey, chatHistoryRef.current);

      setStatusText('오브젝트 배치 중...');

      const parts: string[] = [];
      const stats: string[] = [];

      if (response.place_room) {
        setStatusText('프로시저럴 배치 중...');
        const state = useEditor.getState();
        const selectedObj = state.selectedIds.length > 0
          ? state.objects.find((o) => o.id === state.selectedIds[state.selectedIds.length - 1])
          : null;

        if (selectedObj) {
          const placeResult = placeRoom(selectedObj, state.objects, response.place_room);
          if (placeResult.objects.length > 0) {
            for (const obj of placeResult.objects) {
              useEditor.getState().streamAddObject(obj);
            }
            useEditor.getState().finalizeStream();
            stats.push(`생성 ${placeResult.objects.length}`);
          }
          if (placeResult.message) parts.push(placeResult.message);
        } else {
          parts.push('오브젝트를 선택한 후 방 배치를 요청해주세요.');
        }
      }

      if (response.actions.length > 0) {
        const result = executeActions(response, (count, total) => {
          setStatusText(`오브젝트 배치 중... (${count}/${total})`);
        });
        if (result.created > 0) stats.push(`생성 ${result.created}`);
        if (result.updated > 0) stats.push(`수정 ${result.updated}`);
        if (result.deleted > 0) stats.push(`삭제 ${result.deleted}`);
        if (result.grouped > 0) stats.push(`그룹 ${result.grouped}`);
      }

      chatHistoryRef.current.push({
        role: 'assistant',
        content: JSON.stringify({ actions: response.actions, place_room: response.place_room, message: response.message }),
      });

      if (response.message && !parts.includes(response.message)) parts.push(response.message);
      if (stats.length > 0) parts.push(`[${stats.join(', ')}]`);

      setStatusText('');
      setMessages((m) => [...m, {
        role: 'assistant',
        text: parts.join('\n') || '완료!',
      }]);
    } catch (err) {
      setStatusText('');
      const store = useEditor.getState();
      if (store._streamedIds.length > 0) {
        const removeSet = new Set(store._streamedIds);
        useEditor.setState({
          objects: store.objects.filter((o) => !removeSet.has(o.id)),
          _streamedIds: [],
        });
      }
      chatHistoryRef.current.pop();
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setMessages((m) => [...m, { role: 'system', text: `오류: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, apiKey]);

  const handleClear = useCallback(() => {
    chatHistoryRef.current = [];
    setMessages([
      { role: 'system', text: '대화가 초기화되었습니다.' },
    ]);
  }, []);

  if (!chatOpen) return null;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={{ fontWeight: 600, fontSize: 11, color: '#ddd' }}>AI Level Design</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button
            onClick={handleClear}
            style={styles.clearBtn}
            title="Clear conversation"
          >
            Clear
          </button>
          <button
            onClick={() => useEditor.getState().toggleChat()}
            style={styles.closeBtn}
            title="Close"
          >
            x
          </button>
        </div>
      </div>

      <div style={styles.keyRow}>
        <input
          type={showKey ? 'text' : 'password'}
          value={apiKey}
          onChange={(e) => saveKey(e.target.value)}
          placeholder="Anthropic API Key"
          style={styles.keyInput}
        />
        <button onClick={() => setShowKey(!showKey)} style={styles.eyeBtn}>
          {showKey ? 'O' : '*'}
        </button>
      </div>

      <div ref={scrollRef} style={styles.messageArea}>
        {messages.map((m, i) => (
          <div key={i} style={msgStyle(m.role)}>
            {m.text}
          </div>
        ))}
        {loading && statusText && (
          <div style={msgStyle('assistant')}>
            {statusText}
          </div>
        )}
      </div>

      <div style={styles.inputRow}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="레벨을 설명하세요..."
          style={styles.chatInput}
          disabled={loading}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{
            ...styles.sendBtn,
            opacity: loading || !input.trim() ? 0.4 : 1,
          }}
        >
          Go
        </button>
      </div>
    </div>
  );
}

function msgStyle(role: string): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 6,
    fontSize: 11,
    lineHeight: 1.5,
    maxWidth: '92%',
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
  };
  if (role === 'user') return { ...base, background: '#1e3a5f', color: '#93c5fd', alignSelf: 'flex-end' };
  if (role === 'assistant') return { ...base, background: '#1a3d2a', color: '#6ee7a0', alignSelf: 'flex-start' };
  return { ...base, background: '#333', color: '#999', alignSelf: 'center', fontStyle: 'italic', fontSize: 10 };
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 380,
    maxHeight: 520,
    display: 'flex',
    flexDirection: 'column',
    background: '#1e1e1e',
    border: '1px solid #444',
    borderRadius: 8,
    boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    zIndex: 100,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 10px',
    background: '#252525',
    borderBottom: '1px solid #333',
  },
  clearBtn: {
    background: 'none',
    border: '1px solid #555',
    color: '#888',
    fontSize: 9,
    cursor: 'pointer',
    padding: '2px 6px',
    borderRadius: 3,
    lineHeight: 1,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: 14,
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1,
  },
  keyRow: {
    display: 'flex',
    gap: 4,
    padding: '6px 8px',
    borderBottom: '1px solid #333',
  },
  keyInput: {
    flex: 1,
    background: '#2a2a2a',
    border: '1px solid #444',
    borderRadius: 4,
    padding: '4px 6px',
    color: '#aaa',
    fontSize: 10,
    outline: 'none',
  },
  eyeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    padding: '0 4px',
    color: '#888',
  },
  messageArea: {
    flex: 1,
    overflowY: 'auto',
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minHeight: 200,
    maxHeight: 360,
  },
  inputRow: {
    display: 'flex',
    gap: 4,
    padding: '6px 8px',
    borderTop: '1px solid #333',
  },
  chatInput: {
    flex: 1,
    background: '#2a2a2a',
    border: '1px solid #444',
    borderRadius: 4,
    padding: '6px 8px',
    color: '#ddd',
    fontSize: 11,
    outline: 'none',
  },
  sendBtn: {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 700,
  },
};

import { useState, useRef, useEffect, useCallback } from 'react';
import { useEditor } from '../store';
import { streamChatMessage, type ChatMessage } from '../services/anthropicChat';
import { generateOuterWalls } from '../services/autoWalls';

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
    { role: 'system', text: 'AI 레벨 디자인 어시스턴트입니다. 자연어로 레벨을 생성하세요.\n예: "5x5 방 3개를 복도로 연결해줘"' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [streamObjCount, setStreamObjCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages, streamText]);

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
    setStreamText('');
    setStreamObjCount(0);

    try {
      const history: ChatMessage[] = [
        ...messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text })),
        { role: 'user' as const, content: text },
      ];

      const sceneObjects = useEditor.getState().objects;
      const result = await streamChatMessage(
        apiKey, history, sceneObjects,
        (chunk) => { setStreamText(chunk); },
        (obj) => {
          useEditor.getState().streamAddObject(obj);
          setStreamObjCount((c) => c + 1);
        },
      );

      setStreamText('');

      const store = useEditor.getState();
      const streamedPolygons = store.objects.filter(
        (o) => store._streamedIds.includes(o.id) && o.type === 'polygon',
      );
      const autoWalls = generateOuterWalls(streamedPolygons);
      for (const w of autoWalls) {
        store.streamAddObject(w);
      }

      useEditor.getState().finalizeStream(result.remove);

      const floorCount = streamedPolygons.length;
      const wallCount = autoWalls.length;
      const summary = [];
      if (result.remove.length > 0) summary.push(`${result.remove.length}개 삭제`);
      if (floorCount > 0) summary.push(`바닥 ${floorCount}개`);
      if (wallCount > 0) summary.push(`벽 ${wallCount}개 자동생성`);
      const badge = summary.length > 0 ? ` [${summary.join(', ')}]` : '';

      setMessages((m) => [...m, {
        role: 'assistant',
        text: result.description + badge,
      }]);
    } catch (err) {
      setStreamText('');
      const store = useEditor.getState();
      if (store._streamedIds.length > 0) {
        const removeSet = new Set(store._streamedIds);
        useEditor.setState({
          objects: store.objects.filter((o) => !removeSet.has(o.id)),
          _streamedIds: [],
        });
      }
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setMessages((m) => [...m, { role: 'system', text: `오류: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, apiKey, messages]);

  if (!chatOpen) return null;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={{ fontWeight: 600, fontSize: 11, color: '#ddd' }}>AI Level Design</span>
        <button
          onClick={() => useEditor.getState().toggleChat()}
          style={styles.closeBtn}
          title="Close"
        >
          ×
        </button>
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
          {showKey ? '🔓' : '🔒'}
        </button>
      </div>

      <div ref={scrollRef} style={styles.messageArea}>
        {messages.map((m, i) => (
          <div key={i} style={msgStyle(m.role)}>
            {m.text}
          </div>
        ))}
        {loading && (
          <div style={msgStyle('assistant')}>
            {formatStream(streamText, streamObjCount)}
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
          ▶
        </button>
      </div>
    </div>
  );
}

function formatStream(raw: string, placedCount: number): string {
  if (placedCount > 0) {
    const descMatch = raw.match(/"description"\s*:\s*"([^"]*)/);
    const desc = descMatch ? descMatch[1] : '';
    return `${desc ? desc + '\n' : ''}오브젝트 ${placedCount}개 배치 완료...`;
  }

  const descMatch = raw.match(/"description"\s*:\s*"([^"]*)/);
  if (descMatch) return descMatch[1] + '...';

  if (!raw) return '생성 중...';
  return '분석 중...';
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
    width: 360,
    maxHeight: 480,
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
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: 16,
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
    padding: '0 2px',
  },
  messageArea: {
    flex: 1,
    overflowY: 'auto',
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minHeight: 200,
    maxHeight: 320,
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
    fontSize: 12,
    fontWeight: 700,
  },
  dots: {
    display: 'inline-block',
    animation: 'pulse 1.5s infinite',
  },
};

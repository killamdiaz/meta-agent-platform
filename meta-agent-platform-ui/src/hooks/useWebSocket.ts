import { useEffect, useRef, useState } from 'react';
import { WS_BASE_URL } from '../config';

export type ConsoleEvent =
  | { event: 'task:queued'; taskId: string; agentId: string; prompt: string; timestamp: string }
  | { event: 'task:start'; taskId: string; agentId: string; prompt: string; timestamp: string }
  | { event: 'task:thought'; taskId: string; agentId: string; thought: string; timestamp: string }
  | { event: 'task:action'; taskId: string; agentId: string; action: unknown; timestamp: string }
  | { event: 'task:completed'; taskId: string; agentId: string; result: unknown; timestamp: string }
  | { event: 'task:error'; taskId: string; agentId: string; error: unknown; timestamp: string }
  | { event: 'socket:error'; message: string };

export function useWebSocket() {
  const [events, setEvents] = useState<ConsoleEvent[]>([]);
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number>();

  useEffect(() => {
    function connect() {
      const socket = new WebSocket(WS_BASE_URL);
      socketRef.current = socket;
      setStatus('connecting');

      socket.onopen = () => {
        setStatus('open');
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as ConsoleEvent;
          setEvents((prev) => [...prev, payload].slice(-200));
        } catch (error) {
          console.error('Failed to parse socket message', error);
        }
      };

      socket.onclose = () => {
        setStatus('closed');
        if (typeof reconnectTimer.current === 'number') {
          window.clearTimeout(reconnectTimer.current);
        }
        reconnectTimer.current = window.setTimeout(connect, 2000);
      };

      socket.onerror = () => {
        setStatus('closed');
        socket.close();
      };
    }

    connect();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (typeof reconnectTimer.current === 'number') {
        window.clearTimeout(reconnectTimer.current);
      }
    };
  }, []);

  function send(payload: Record<string, unknown>) {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    }
  }

  return { events, status, send };
}

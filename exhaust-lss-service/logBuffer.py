import collections
from typing import Dict, List, Any

MAX_LOGS = 1000


class LogBuffer:
  """
  In-memory rolling buffer per stream. Not persisted.
  """

  def __init__(self, max_logs: int = MAX_LOGS):
    self.max_logs = max_logs
    self.buffers: Dict[str, collections.deque] = {}

  def add_log(self, stream_id: str, entry: Dict[str, Any]):
    buf = self.buffers.get(stream_id)
    if buf is None:
      buf = collections.deque(maxlen=self.max_logs)
      self.buffers[stream_id] = buf
    buf.append(entry)

  def get_logs(self, stream_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    buf = self.buffers.get(stream_id)
    if not buf:
      return []
    limit = max(1, min(limit, self.max_logs))
    # Return newest first
    return list(buf)[-limit:]

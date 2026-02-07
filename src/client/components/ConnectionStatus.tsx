interface ConnectionStatusProps {
  status: 'idle' | 'testing' | 'success' | 'error';
  serverName?: string;
  movieCount?: number;
  libraryTitle?: string;
  error?: string;
}

export function ConnectionStatus({
  status,
  serverName,
  movieCount,
  libraryTitle,
  error,
}: ConnectionStatusProps) {
  if (status === 'idle') {
    return null;
  }

  if (status === 'testing') {
    return (
      <div class="connection-status testing">
        <span class="status-dot" />
        <span>Testing connection...</span>
      </div>
    );
  }

  if (status === 'success') {
    const countStr =
      movieCount !== undefined ? movieCount.toLocaleString() : '?';
    const libStr = libraryTitle ? ` in '${libraryTitle}' library` : '';

    return (
      <div class="connection-status success">
        <span class="status-icon">&#10003;</span>
        <span>
          Connected to {serverName || 'Plex Server'}
          {libraryTitle
            ? ` -- ${countStr} movies${libStr}`
            : ''}
        </span>
      </div>
    );
  }

  // error
  return (
    <div class="connection-status error">
      <span class="status-icon">!</span>
      <span>{error || 'Connection failed'}</span>
    </div>
  );
}

import { useEffect, useState } from 'react';

import './App.css';

/** Shape of the payload returned by the backend's /api/health route. */
type Health = {
  status: string;
  uptime: number;
};

/** Landing page - reports whether the backend API is reachable. */
function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // '/api' is proxied to the backend by vite, so this stays same-origin
    fetch('/api/health')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        return response.json();
      })
      .then((data: Health) => setHealth(data))
      .catch((cause: Error) => setError(cause.message));
  }, []);

  return (
    <main>
      <h1>Notes</h1>
      {health && (
        <p>
          API status: <strong>{health.status}</strong>
        </p>
      )}
      {error && <p role="alert">Could not reach the API: {error}</p>}
      {!health && !error && <p>Checking the API...</p>}
    </main>
  );
}

export default App;

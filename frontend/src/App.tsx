import { BrowserRouter } from 'react-router-dom';

import './App.css';
import { AppRoutes } from './AppRoutes';
import { AuthProvider } from './auth/AuthProvider';

/** Wraps the routes in the router and the auth context they both need. */
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

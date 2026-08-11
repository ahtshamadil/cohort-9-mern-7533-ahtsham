import { BrowserRouter } from 'react-router-dom';

import './App.css';
import { AppRoutes } from './AppRoutes';
import { AuthProvider } from './auth/AuthProvider';
import { ThemeProvider } from './theme/ThemeProvider';

/** Wraps the routes in the router and the two contexts they need. */
function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;

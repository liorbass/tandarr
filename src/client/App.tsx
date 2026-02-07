import { LocationProvider, Router, Route } from 'preact-iso';
import { LibraryPage } from './components/LibraryPage';
import { ConfigPage } from './components/ConfigPage';
import { RoomPage } from './components/RoomPage';

export function App() {
  return (
    <LocationProvider>
      <Router>
        <Route path="/" component={LibraryPage} />
        <Route path="/config" component={ConfigPage} />
        <Route path="/room" component={RoomPage} />
      </Router>
    </LocationProvider>
  );
}

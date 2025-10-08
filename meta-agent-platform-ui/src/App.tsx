import { NavLink, Route, Routes } from 'react-router-dom';
import ConsolePage from './pages/ConsolePage';
import MemoryPage from './pages/MemoryPage';
import NetworkPage from './pages/NetworkPage';

function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">Meta Agent Platform</h1>
        <nav className="app-nav">
          <NavLink to="/network" className={({ isActive }) => (isActive ? 'active' : '')}>
            Agent Network
          </NavLink>
          <NavLink to="/console" className={({ isActive }) => (isActive ? 'active' : '')}>
            Console
          </NavLink>
          <NavLink to="/memory" className={({ isActive }) => (isActive ? 'active' : '')}>
            Memory Graph
          </NavLink>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<NetworkPage />} />
          <Route path="/network" element={<NetworkPage />} />
          <Route path="/console" element={<ConsolePage />} />
          <Route path="/memory" element={<MemoryPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;

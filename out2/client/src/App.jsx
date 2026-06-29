import { Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage.jsx";
import PlayerPage from "./pages/PlayerPage.jsx";
import LibraryPage from "./pages/LibraryPage.jsx";
import Navbar from "./components/Navbar.jsx";

export default function App() {
  return (
    <div className="min-h-screen bg-void grid-bg">
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/player" element={<PlayerPage />} />
        <Route path="/library" element={<LibraryPage />} />
      </Routes>
    </div>
  );
}

import { Link, useLocation } from "react-router-dom";

export default function Navbar() {
  const { pathname } = useLocation();

  const links = [
    { to: "/", label: "Watch" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4"
      style={{ background: "rgba(4,4,10,0.85)", backdropFilter: "blur(20px)", borderBottom: "1px solid #1e1e2e" }}>
      <Link to="/" className="flex items-center gap-2 no-underline">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #00d4ff, #ff3cac)", boxShadow: "0 0 16px rgba(0,212,255,0.4)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2-5.83V7.83L16 12l-6 2.17z"/>
          </svg>
        </div>
        <span className="font-display text-2xl tracking-widest text-white">VRVAULT</span>
      </Link>

      <div className="flex items-center gap-1">
        {links.map(({ to, label }) => (
          <Link key={to} to={to}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 no-underline"
            style={{
              background: pathname === to ? "rgba(0,212,255,0.1)" : "transparent",
              color: pathname === to ? "#00d4ff" : "#4a4a6a",
              border: pathname === to ? "1px solid rgba(0,212,255,0.3)" : "1px solid transparent",
            }}>
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

import React from "react";
import { createRoot } from "react-dom/client";

function App() {
  return (
    <main style={{ fontFamily: "Georgia, serif", padding: 24 }}>
      <h1>Game Game</h1>
      <p>Web client shell is ready.</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

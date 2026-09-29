"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main style={{ display: "grid", minHeight: "100vh", placeItems: "center", padding: "24px", fontFamily: "Arial, sans-serif" }}>
          <section>
            <h1>Something went wrong</h1>
            <p>The application could not load this page.</p>
            <button type="button" onClick={() => reset()}>Try again</button>
          </section>
        </main>
      </body>
    </html>
  );
}

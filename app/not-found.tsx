import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ textAlign: "center", marginTop: "10vh" }}>
      <h1>404 - Page Not Found</h1>
      <p>The page you are looking for does not exist.</p>
      <Link href="/" passHref legacyBehavior>
        <a
          className="khh-btn-primary"
          style={{
            marginTop: 20,
            padding: "8px 16px",
            fontSize: 16,
            display: "inline-block",
          }}
          aria-label="Go Home"
        >
          Go Home
        </a>
      </Link>
    </main>
  );
}

"use client";

export default function SimpleTestPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Simple Test Page</h1>
      <p>
        This is a minimal test page to check if the basic Next.js setup is
        working.
      </p>
      <div className="mt-4">
        <button className="bg-blue-500 text-white px-4 py-2 rounded">
          Test Button
        </button>
      </div>
    </div>
  );
}

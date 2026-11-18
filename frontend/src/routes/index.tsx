import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <main className="bl-container bl-section">
      <h1 className="text-3xl font-semibold">BlockCalc</h1>
    </main>
  );
}

import { Button, Card } from '../components/kit';

export default function HomePage() {
  return (
    <Card title="Welcome to Stufen" headingLevel={1}>
      <p>Your daily German practice will live here.</p>
      <Button>Start learning</Button>
    </Card>
  );
}

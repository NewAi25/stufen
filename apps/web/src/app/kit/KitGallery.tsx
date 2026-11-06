'use client';

import { useState } from 'react';
import { Button, Card, Choice, Progress, TextInput, useToast } from '@stufen/ui-kit';
import { ThemeToggle } from '../../components/ThemeProvider';

const ARTICLE_OPTIONS = [
  { value: 'der', label: 'der', lang: 'de' },
  { value: 'die', label: 'die', lang: 'de' },
  { value: 'das', label: 'das', lang: 'de' },
] as const;

/** One of each ui-kit piece, for a quick look in both themes. */
export function KitGallery() {
  const toast = useToast();
  const [article, setArticle] = useState<string | null>(null);
  const [name, setName] = useState('');

  return (
    <div className="flex flex-col gap-6">
      <Card title="Theme" headingLevel={2}>
        <ThemeToggle />
      </Card>

      <Card title="Button" headingLevel={2}>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button size="lg">Large</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Card>

      <Card title="Progress" headingLevel={2}>
        <div className="flex flex-col gap-3">
          <Progress value={5} max={12} label="Lesson progress" valueText="5 of 12" />
          <Progress value={40} label="Level progress" size="sm" />
        </div>
      </Card>

      <Card title="TextInput" headingLevel={2}>
        <div className="flex flex-col gap-4">
          <TextInput
            label="Display name"
            hint="Shown on your profile."
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <TextInput label="Email" defaultValue="not an email" error="Enter a valid email." />
        </div>
      </Card>

      <Card title="Choice" headingLevel={2}>
        <Choice
          label="Which article goes with Haus?"
          options={ARTICLE_OPTIONS}
          value={article}
          onChange={setArticle}
        />
      </Card>

      <Card title="Toast" headingLevel={2}>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => toast.show({ message: 'Saved.' })}>
            Show toast
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast.show({ message: 'Could not save.', tone: 'error' })}
          >
            Show error toast
          </Button>
        </div>
      </Card>
    </div>
  );
}

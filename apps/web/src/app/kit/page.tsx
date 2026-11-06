import type { Metadata } from 'next';
import { KitGallery } from './KitGallery';

export const metadata: Metadata = { title: 'Kit gallery | Stufen' };

export default function KitPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Kit gallery</h1>
      <KitGallery />
    </>
  );
}

import { OversightView } from '@/components/dashboard/ai-views';
import { buildDemoOversight } from '@/lib/demo/oversight';

export const dynamic = 'force-dynamic';

export default function DemoAiPage() {
  return <OversightView {...buildDemoOversight()} />;
}

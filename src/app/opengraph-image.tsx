import { ImageResponse } from 'next/og';
import { siteConfig } from '@/lib/site';

// The preview card shown when the site link is shared in a text, email or social post.
export const alt = `${siteConfig.name}: never lose a job to a missed call`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 80, background: '#0B1220', color: '#F5F7FA' }}>
        <div style={{ fontSize: 32, fontWeight: 700, color: '#7FA8F5' }}>{siteConfig.name}</div>
        <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05 }}>Never lose a job to a missed call.</div>
        <div style={{ fontSize: 30, color: '#B8C2D1' }}>Text-back, an AI receptionist and Google review replies for the trades.</div>
      </div>
    ),
    size
  );
}

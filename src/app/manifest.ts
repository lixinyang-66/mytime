import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MyTime',
    short_name: 'MyTime',
    description: '感知时间的流逝，每天靠近目标。',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#FFF8EC',
    theme_color: '#FFB86B',
    icons: [
      {
        src: '/icons/mytime-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}

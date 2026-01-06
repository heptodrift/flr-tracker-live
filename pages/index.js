import dynamic from 'next/dynamic';
import Head from 'next/head';

// Dynamic import to avoid SSR issues with recharts
const FLRTrackerLive = dynamic(
  () => import('../src/FLRTrackerLive'),
  { ssr: false }
);

export default function Home() {
  return (
    <>
      <Head>
        <title>FLR Tracker | Live Fractal Liquidity Regime Monitor</title>
        <meta name="description" content="Real-time market phase transition detection using Critical Slowing Down and LPPL bubble analysis with live Fed data." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <FLRTrackerLive />
    </>
  );
}

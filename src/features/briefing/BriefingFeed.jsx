import { useState } from 'react';
import { loadBriefingDelivery } from './briefing-artifact.js';
import { BriefingView } from './BriefingView.jsx';

// Optional encrypted static feed only. No model/provider request can originate here.
export function BriefingFeed() {
  const [password, setPassword] = useState('');
  const [session, setSession] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  async function unlock(event) {
    event.preventDefault();
    setLoading(true);
    try {
      const result = await loadBriefingDelivery('./data/briefing-status.json', './data/briefing.enc.json', password, {
        expectedSession: session,
        expectedExecutionMode: import.meta.env.DEV ? 'fake_transport' : 'provider'
      });
      setData(result);
    } finally {
      setPassword('');
      setLoading(false);
    }
  }
  if (data) return <BriefingView data={data} toolbar={<button onClick={() => setData(null)}>결과 닫기</button>} />;
  return <main className="brief-demo brief-main"><h1>브리핑 열기</h1><p>암호화된 선택적 결과를 읽습니다. 분석을 새로 실행하지 않습니다.</p><form onSubmit={unlock}>
    <label className="brief-scenario">확인할 자료 기준 거래일<input type="date" required value={session} onChange={event => setSession(event.target.value)} /></label>
    <label className="brief-scenario">결과 암호<input type="password" required autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} /></label>
    <button disabled={loading} type="submit">{loading ? '결과 확인 중' : '브리핑 열기'}</button></form></main>;
}

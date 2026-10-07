import {useEffect,useRef,useState} from 'react';
import {time} from './Chart';
interface Result {summary:string;generatedAt:string;context:{warnings:string[];markets:{market:string}[]}}
export function Agent({market,timeframe,portfolio}:{market:string;timeframe:string;portfolio:boolean}){
 const [configured,setConfigured]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<Result|null>(null);
 const active=useRef(true);const request=useRef<AbortController|null>(null);
 useEffect(()=>{active.current=true;const c=new AbortController();void fetch('/agent/status',{signal:c.signal}).then(async r=>{if(!r.ok)throw Error();return r.json();}).then(d=>setConfigured(d.configured)).catch(()=>{if(!c.signal.aborted)setError('AI 설정 상태를 확인하지 못했습니다. 다시 연결해 주세요.');});return()=>{active.current=false;c.abort();request.current?.abort();};},[]);
 async function run(kind:'market'|'portfolio'|'briefing'){
  if(busy)return;setBusy(true);setError('');setResult(null);const c=new AbortController();request.current=c;const timer=setTimeout(()=>c.abort(),150000);
  try{const r=await fetch(kind==='market'?`/agent/market/${market}`:`/agent/${kind}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({timeframe}),signal:c.signal});
   if(!r.ok)throw Error(r.status===401?'워크스페이스를 다시 연결해 주세요.':r.status===429?'요약 요청이 진행 중입니다. 잠시 후 다시 시도하세요.':r.status===503?'AI 설정 또는 분석 데이터를 사용할 수 없습니다.':'AI 응답을 받지 못했습니다. 모델 접근 권한·사용량을 확인하세요.');
   const data=await r.json();if(active.current)setResult(data);
  }catch(e){if(active.current)setError(e instanceof Error&&e.name!=='AbortError'?e.message:'요약 요청 시간이 초과되었습니다.');}finally{clearTimeout(timer);if(active.current)setBusy(false);}
 }
 return <section className="panel" aria-label="AI 요약"><div className="panel-header"><div><h2>AI 시장 요약</h2><p>관측 데이터와 해석을 나누어 읽어보세요</p></div></div><div className="notice">버튼을 누르면 계산된 시장 지표와 알림 조건을 Google Gemini로 전송합니다. 포트폴리오·브리핑에는 보유 종목, 평가액, 비중, 수익률도 포함됩니다. API 사용료가 발생할 수 있습니다. 원본 캔들·계좌 식별자·API 키는 분석 데이터에 포함하지 않습니다.</div><div className="agent-actions"><button className="primary" disabled={!configured||busy} onClick={()=>void run(portfolio?'portfolio':'market')}>{busy?'요약 생성 중…':portfolio?'내 포트폴리오 요약':`${market} 시장 요약`}</button><button className="secondary" disabled={!configured||busy} onClick={()=>void run('briefing')}>전체 브리핑 생성</button></div>{configured===false&&<div className="notice">AI 설정 필요: .env에 GOOGLE_AI_STUDIO_API_KEY을 설정하고 Backend를 재시작하세요.</div>}{error&&<div className="inline-error" role="alert">{error}</div>}{result&&<div className="agent-result"><small>{time(result.generatedAt)} KST · AI 생성 요약 · {result.context.markets.map(m=>m.market).join(', ')}</small><p>{result.summary}</p>{result.context.warnings.length>0&&<div className="notice">일부 데이터 누락 또는 분석 범위 제한: {result.context.warnings.join(', ')}</div>}<small>요약에는 오류가 있을 수 있습니다. 원본 지표와 함께 확인하세요.</small></div>}</section>;
}

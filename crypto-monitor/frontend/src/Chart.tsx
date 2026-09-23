import { useState } from 'react';
import type { Candle } from './types';
export const number = (n: number|null|undefined, digits = 0) => n == null ? '—' : n.toLocaleString('ko-KR', { maximumFractionDigits: digits });
export const time = (s: string) => new Date(s).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

export function Chart({ rows }: { rows: Candle[] }) {
  const [hover, setHover] = useState<number|null>(null);
  if (!rows.length) return <div className="chart-empty">표시할 캔들이 없습니다.</div>;
  const w = 900, h = 300, left = 10, right = 90, top = 22, bottom = 38;
  const rawHigh = Math.max(...rows.map(r => r.high)), rawLow = Math.min(...rows.map(r => r.low));
  const margin = (rawHigh - rawLow || rawHigh * .01 || 1) * .15;
  const high = rawHigh + margin, low = rawLow - margin;
  const y = (v: number) => top + (high - v) / (high - low) * (h - top - bottom);
  const step = (w - left - right) / rows.length;
  const maxVolume = Math.max(...rows.map(r => r.volume), 1);
  const active = rows[hover ?? rows.length - 1];
  return <div className="chart-wrap">
    <div className="ohlc"><span>{time(active.timestamp)} KST</span><span>시가 <b>{number(active.open, 8)}</b></span><span>고가 <b>{number(active.high, 8)}</b></span><span>저가 <b>{number(active.low, 8)}</b></span><span>종가 <b>{number(active.close, 8)}</b></span></div>
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="가격 캔들 차트" onMouseLeave={() => setHover(null)} onMouseMove={e => { const box = e.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(rows.length - 1, Math.floor(((e.clientX - box.left) / box.width * w - left) / step)))); }}>
      {[0,1,2,3,4].map(i => { const value = high - (high - low) * i / 4; return <g key={i}><line x1={left} x2={w-right} y1={y(value)} y2={y(value)} stroke="#edf0f3"/><text x={w-right+12} y={y(value)+4} fill="#88919e" fontSize="11">{number(value, value < 1 ? 8 : 0)}</text></g>; })}
      {rows.map((row,i) => { const x = left + step * (i + .5), color = row.close >= row.open ? '#169b7f' : '#df6472'; return <g key={row.timestamp}><rect x={x-step*.3} y={h-bottom-row.volume/maxVolume*30} width={Math.max(1,step*.6)} height={row.volume/maxVolume*30} fill={color} opacity=".12"/><line x1={x} x2={x} y1={y(row.high)} y2={y(row.low)} stroke={color}/><rect x={x-step*.3} y={Math.min(y(row.open),y(row.close))} width={Math.max(1,step*.6)} height={Math.max(1,Math.abs(y(row.open)-y(row.close)))} fill={color}/></g>; })}
      {[0,.25,.5,.75].map(r => { const i = Math.floor((rows.length-1)*r); return <text key={r} x={left+step*i} y={h-10} fill="#88919e" fontSize="11">{time(rows[i].timestamp)}</text>; })}
      {hover !== null && <line x1={left+step*(hover+.5)} x2={left+step*(hover+.5)} y1={top} y2={h-bottom} stroke="#7b8492" strokeDasharray="3 4"/>}
    </svg>
  </div>;
}

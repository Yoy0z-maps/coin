import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const { localAccess }=require('../../backend/scripts/portfolio.cjs');
const {token}=localAccess();
test('public dashboard is responsive and charts load',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  await expect(page.getByRole('heading',{name:'시장을 한눈에.'})).toBeVisible();
  await expect(page.locator('.chart-empty')).toHaveCount(0,{timeout:60000});
  await expect(page.locator('.inline-error')).toHaveCount(0);
  await page.screenshot({path:'test-results/dashboard-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/dashboard-mobile.png',fullPage:true});
});
test('session, watchlist, alerts, realtime and private portfolio UI',async({page,request})=>{
  const headers={'X-Monitor-Token':token};
  const w=await (await request.get('/watchlist',{headers})).json();
  const a=await (await request.get('/alerts',{headers})).json();
  const market=['KRW-BTC','KRW-ETH','KRW-XRP','KRW-ADA'].find(m=>!w.some((r:any)=>r.market===m)&&!a.some((r:any)=>r.market===m));
  expect(Boolean(market)).toBe(true);let watchId:string|undefined,alertId:string|undefined;
  await page.route('**/portfolio',route=>route.fulfill({json:{valuationComplete:false,totalAssetKRW:null,knownValueKRW:100000,accountsFetchedAt:new Date().toISOString(),assets:[{currency:'KRW',balance:100000,locked:0,valuation:100000,profit:0,profitRate:null,portfolioWeight:null},{currency:'TEST',balance:2,locked:0,valuation:null,profit:null,profitRate:null,portfolioWeight:null,pricingUnavailableReason:'NO_SUPPORTED_MARKET'}]}}));
  try{
    await page.goto('/');await page.getByRole('button',{name:'내 워크스페이스 연결',exact:true}).click();
    await page.getByLabel('로컬 접근 토큰',{exact:true}).fill(token);await page.getByRole('button',{name:'안전하게 연결'}).click();
    await expect(page.getByRole('button',{name:'연결 해제'})).toBeVisible();await page.reload();
    await expect(page.getByRole('button',{name:'연결 해제'})).toBeVisible();
    await page.getByLabel('추가할 관심 종목').fill(market!);
    const created=page.waitForResponse(r=>r.url().endsWith('/watchlist')&&r.request().method()==='POST');
    await page.getByRole('button',{name:'추가',exact:true}).click();watchId=(await (await created).json()).id;
    await expect(page.locator('tbody tr').filter({hasText:market}).getByText('실시간',{exact:true})).toBeVisible({timeout:60000});
    await page.getByRole('button',{name:'가격 알림',exact:true}).click();await page.getByRole('button',{name:'조건 추가',exact:true}).click();
    await page.getByLabel('시장',{exact:true}).fill(market!);await page.getByLabel('목표 가격').fill('1');
    const added=page.waitForResponse(r=>r.url().endsWith('/alerts')&&r.request().method()==='POST');
    await page.getByRole('button',{name:'조건 저장'}).click();alertId=(await (await added).json()).id;
    const row=page.locator('tbody tr').filter({hasText:market});await expect(row).toBeVisible();
    await row.getByRole('button',{name:'수정'}).click();await page.getByLabel('목표 가격').fill('2');await page.getByRole('button',{name:'조건 저장'}).click();
    await expect(row.getByText('₩2',{exact:true})).toBeVisible();await row.getByRole('button',{name:'사용 중'}).click();await expect(row.getByRole('button',{name:'정지'})).toBeVisible();
    await page.getByRole('button',{name:'포트폴리오',exact:true}).click();await expect(page.getByText('확인 가능한 평가액')).toBeVisible();await expect(page.getByText('평가 가능한 시장 없음')).toBeVisible();
    await page.getByRole('button',{name:'연결 해제'}).click();await expect(page.getByText('나의 자산은 나에게만')).toBeVisible();
    expect(await page.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0);
  }finally{
    if(alertId)await request.delete('/alerts/'+alertId,{headers});if(watchId)await request.delete('/watchlist/'+watchId,{headers});
  }
});

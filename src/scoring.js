// Transparent, heuristic running-weather score (not a medical risk assessment).
export const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,v));
export const scoreRange=(value,idealMin,idealMax,low,high)=>{
  if(!Number.isFinite(value)) return null;
  if(value>=idealMin&&value<=idealMax)return 100;
  if(value<idealMin)return clamp(100*(value-low)/(idealMin-low));
  return clamp(100*(high-value)/(high-idealMax));
};
export function scoreHour(h){
  const factors={
    temperature:scoreRange(h.temperature,8,15,-10,34),
    rain:h.precipitation_probability!=null?clamp(100-h.precipitation_probability):h.precipitation!=null?clamp(100-h.precipitation*35):null,
    wind:h.wind_speed!=null?scoreRange(h.wind_speed,0,12,0,55):null,
    humidity:h.humidity!=null?scoreRange(h.humidity,35,70,10,100):null,
    uv:h.uv_index!=null?clamp(100-Math.max(0,h.uv_index-3)*18):null
  };
  const weights={temperature:0.4,rain:0.3,wind:0.15,humidity:0.1,uv:0.05};
  const available=Object.keys(factors).filter(k=>factors[k]!==null);
  if(!available.length)return {score:null,reason:"Keine geeigneten Wetterdaten"};
  const total=available.reduce((sum,k)=>sum+weights[k],0);
  let score=available.reduce((sum,k)=>sum+factors[k]*weights[k],0)/total;
  const condition=String(h.condition||"").toLowerCase();
  if(/lightning|hail|exceptional/.test(condition))score=Math.min(score,10);
  if(h.temperature!=null&&(h.temperature<=-10||h.temperature>=35))score=Math.min(score,20);
  if(h.wind_gust_speed!=null&&h.wind_gust_speed>=65)score=Math.min(score,20);
  return {score:Math.round(clamp(score)),factors,coverage:Math.round(total*100)};
}
export function bestWindow(hours,duration=60){
  const slots=Math.max(1,Math.ceil(duration/60));
  const candidates=[];
  for(let i=0;i<=hours.length-slots;i++){
    const slice=hours.slice(i,i+slots);
    if(slice.some(h=>h.score==null))continue;
    if(slice.some((h,j)=>j>0&&new Date(h.datetime)-new Date(slice[j-1].datetime)!==3600000))continue;
    candidates.push({start:slice[0].datetime,end:new Date(new Date(slice[0].datetime).getTime()+duration*60000).toISOString(),score:Math.round(slice.reduce((s,h)=>s+h.score,0)/slots)});
  }
  return candidates.sort((a,b)=>b.score-a.score)[0]||null;
}
export const scoreLabel=s=>s==null?"Keine Daten":s>=80?"Sehr gut":s>=65?"Gut":s>=45?"Mäßig":"Ungünstig";

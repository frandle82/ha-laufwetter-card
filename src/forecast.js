export function normalizeForecast(forecast,unitSystem={}){
  const temperatureUnit=unitSystem.temperature||"°C";
  const windUnit=unitSystem.wind_speed||"km/h";
  const toC=t=>t==null?null:temperatureUnit==="°F"?(Number(t)-32)*5/9:Number(t);
  const toKmh=v=>v==null?null:windUnit==="mph"?Number(v)*1.609344:windUnit==="m/s"?Number(v)*3.6:windUnit==="kn"?Number(v)*1.852:Number(v);
  return (forecast||[]).filter(x=>x.datetime&&!Number.isNaN(Date.parse(x.datetime))).map(x=>({
    datetime:x.datetime,temperature:toC(x.temperature),
    precipitation_probability:x.precipitation_probability!=null?Number(x.precipitation_probability):null,
    precipitation:x.precipitation!=null?Number(x.precipitation):null,
    wind_speed:toKmh(x.wind_speed),wind_gust_speed:toKmh(x.wind_gust_speed),
    humidity:x.humidity!=null?Number(x.humidity):null,
    uv_index:x.uv_index!=null?Number(x.uv_index):null,
    condition:x.condition||""
  })).sort((a,b)=>Date.parse(a.datetime)-Date.parse(b.datetime));
}

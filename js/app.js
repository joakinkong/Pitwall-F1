// ============================================================
// APP — Logica principal: navegacion, charts, UI, detalles
// Cambia cuando agregas una feature o arreglas un bug de UI.
// ============================================================

let currentYear='2026',currentTab='drivers',chart=null,miniChart=null,currentPage='home',navStack=[],homeChartDriver=null,homeChartTeam=null,countdownInterval=null;

function showPage(p,pushHistory){
if(pushHistory!==false&&currentPage&&currentPage!==p)navStack.push(currentPage);
currentPage=p;
['pageHome','pageStandings','pageCalendar','pageGPDetail','pageDriverDetail','pageTeamDetail'].forEach(id=>{document.getElementById(id).style.display='none';});
const pm={home:'pageHome',standings:'pageStandings',calendar:'pageCalendar',gpdetail:'pageGPDetail',driver:'pageDriverDetail',team:'pageTeamDetail'};
document.getElementById(pm[p]||'pageHome').style.display='block';
document.getElementById('bottomNav').style.display='flex';
const isDetail=['gpdetail','driver','team'].includes(p);
document.getElementById('backBtn').style.display=isDetail?'flex':'none';
document.getElementById('headerLeft').style.display=isDetail?'none':'flex';
document.getElementById('headerRight').style.display=isDetail?'none':'flex';
const nh=document.getElementById('navHome'),ns=document.getElementById('navStandings'),nc=document.getElementById('navCalendar');
[nh,ns,nc].forEach(b=>{b.className=b.className.replace('text-[#ffb4a7]','text-zinc-500').replace('border-[#ffb4a7]','border-transparent');b.querySelector('.material-symbols-outlined').style.fontVariationSettings="'FILL' 0";});
let active=null;
if(p==='home')active=nh;
else if(p==='standings'||p==='driver'||p==='team')active=ns;
else if(p==='calendar'||p==='gpdetail')active=nc;
if(active){active.className=active.className.replace('text-zinc-500','text-[#ffb4a7]').replace('border-transparent','border-[#ffb4a7]');active.querySelector('.material-symbols-outlined').style.fontVariationSettings="'FILL' 1";}
if(p==='home')buildHome();if(p==='calendar')buildCalendar();if(p==='standings'){buildChart(currentTab);buildStandings(currentTab);updateSeasonStatus();}window.scrollTo(0,0);}

function goBack(){
if(navStack.length>0){
  const prev=navStack.pop();
  showPage(prev,false);
}else{
  showPage('standings',false);
}
}

function changeYear(y){currentYear=y;document.getElementById('seasonTitle').textContent='SEASON '+y;const s=SEASONS[y];document.getElementById('raceCount').textContent=(s.completed?s.completed+'/'+s.races.length:s.races.length)+' Carreras';buildCompare();buildChart(currentTab);buildStandings(currentTab);if(currentPage==='home')buildHome();if(currentPage==='calendar')buildCalendar();updateSeasonStatus();}

function buildChart(tab){const ctx=document.getElementById('mainChart').getContext('2d');if(chart)chart.destroy();const s=SEASONS[currentYear];let source=tab==='drivers'?s.drivers:s.constructors;
const idA=document.getElementById('selectA')?.value,idB=document.getElementById('selectB')?.value;
if(idA&&idB)source=source.filter(d=>d.id===idA||d.id===idB);
let sec=new Set();if(tab==='drivers'){const tb={};for(const d of source){if(!tb[d.color]||d.total>tb[d.color].total)tb[d.color]=d;}for(const d of source){if(tb[d.color]&&tb[d.color].id!==d.id)sec.add(d.id);}}
const racesDone=s.completed||s.races.length;const chartLabels=s.races.slice(0,racesDone);const ds=source.map(d=>({label:d.id,data:d.cum.slice(0,racesDone),borderColor:d.color,backgroundColor:d.color+'18',borderWidth:2.2,borderDash:sec.has(d.id)?[6,3]:[],pointRadius:3,pointHoverRadius:6,pointBackgroundColor:d.color,pointBorderColor:'#121314',pointBorderWidth:1.5,tension:.3,fill:false}));
var hlPlugin={id:'hl',_hx:-1,afterEvent:function(ch,args){
  var e=args.event;
  if(!e||e.type==='mouseout'){
    if(this._hx!==-1){this._hx=-1;ch.options.scales.x.ticks.color='#52525b';ch.update('none');}
    ch.canvas.style.cursor='';return;
  }
  var a=ch.chartArea,onLbl=e.y>a.bottom-20;
  ch.canvas.style.cursor=onLbl?'pointer':'';
  var hi=-1;
  if(onLbl){
    var rel=(e.x-a.left)/(a.right-a.left);
    hi=Math.round(rel*(ch.data.labels.length-1));
    if(hi<0||hi>=ch.data.labels.length)hi=-1;
  }
  if(this._hx!==hi){
    this._hx=hi;
    ch.options.scales.x.ticks.color=function(c){return c.index===hi?'#ffb4a7':'#52525b';};
    ch.update('none');
  }
}};
chart=new Chart(ctx,{type:'line',plugins:[hlPlugin],data:{labels:chartLabels,datasets:ds},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{backgroundColor:'#1b1c1dee',titleColor:'#ffb4a7',bodyColor:'#e3e2e3',borderColor:'#343536',borderWidth:1,titleFont:{family:"'Space Grotesk'",size:11,weight:'700'},bodyFont:{family:"'Inter'",size:11},padding:12,cornerRadius:0,displayColors:true,boxWidth:8,boxHeight:8,boxPadding:4,itemSort:(a,b)=>b.raw-a.raw,callbacks:{title:i=>'GP '+i[0].label,label:i=>' '+i.dataset.label+'  '+i.raw+' pts'}}},scales:{x:{grid:{color:'#1f2021',lineWidth:.5},ticks:{color:'#52525b',font:{family:"'Space Grotesk'",size:10,weight:'600'},maxRotation:45},border:{color:'#343536'}},y:{grid:{color:'#1f2021',lineWidth:.5},ticks:{color:'#52525b',font:{family:"'Space Grotesk'",size:10}},border:{color:'#343536'},beginAtZero:true}},animation:{duration:900,easing:'easeOutQuart'},
onClick:function(evt,el,ch){
  var a=ch.chartArea;
  if(evt.y>a.bottom-20){
    var rel=(evt.x-a.left)/(a.right-a.left);
    var idx=Math.round(rel*(ch.data.labels.length-1));
    if(idx>=0&&idx<ch.data.labels.length)openGP(idx);
  }
}}});
const le=document.getElementById('chartLegend');le.innerHTML=source.map((d,i)=>{const isDash=sec.has(d.id);const st=isDash?'background:transparent;border:2px dashed '+d.color:'background:'+d.color;return '<button onclick="toggleDs('+i+')" class="flex items-center gap-1.5 cursor-pointer transition-opacity" id="lb'+i+'"><span class="legend-dot" style="'+st+'"></span><span class="text-[9px] uppercase font-bold text-zinc-400 hover:text-white transition-colors font-headline tracking-wider">'+d.id+'</span></button>';}).join('');
document.getElementById('chartSubtitle').textContent=s.races.length+' GP — '+(tab==='drivers'?'Pilotos':'Constructores');}
function toggleDs(i){const m=chart.getDatasetMeta(i);m.hidden=!m.hidden;chart.update();document.getElementById('lb'+i).style.opacity=m.hidden?'.25':'1';}
function buildStandings(tab){const s=SEASONS[currentYear],source=tab==='drivers'?s.drivers:s.constructors,ch=tab==='drivers'?s.champion_driver:s.champion_constructor;const c=document.getElementById('standingsCards');document.getElementById('standingsTitle').textContent='Clasificación — '+(tab==='drivers'?'Pilotos':'Constructores');
c.innerHTML=source.map((d,i)=>{const p=String(i+1).padStart(2,'0'),pc=i<3?['text-[#FFD700]','text-[#C0C0C0]','text-[#CD7F32]'][i]:'text-zinc-600',bg=i===0?'bg-surface-container-high':'bg-surface-container-low',ptC=i===0?'text-primary':'text-zinc-500',tm=tab==='drivers'?'<p class="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">'+d.team+'</p>':'',bd=d.id===ch?'<span class="champion-badge ml-2">Campeón</span>':'',br=i===0?'<div class="absolute left-0 top-0 w-1 h-full" style="background:'+d.color+'"></div>':'';const onclick=tab==='drivers'?'openDriverDetail(\''+d.id+'\')':'openTeamDetail(\''+d.id+'\')';return '<div class="relative rank-card cursor-pointer" onclick="'+onclick+'">'+br+'<div class="'+bg+' flex items-center p-4"><div class="w-10 flex flex-col items-center justify-center border-r border-white/5 mr-4"><span class="text-2xl font-headline font-black italic leading-none tabular-nums '+pc+'">'+p+'</span></div><div class="flex-1 flex items-center gap-3 min-w-0"><div class="w-1 h-9 flex-shrink-0" style="background:'+d.color+'"></div><div class="min-w-0"><div class="flex items-center"><h4 class="text-sm font-headline font-extrabold uppercase leading-tight tracking-tight truncate">'+d.name+'</h4>'+bd+'</div>'+tm+'</div></div><div class="text-right flex-shrink-0 ml-2"><span class="text-lg font-headline font-bold tabular-nums">'+d.total+'</span><span class="block text-[8px] font-bold '+ptC+' tracking-widest">PTS</span></div><span class="material-symbols-outlined text-zinc-600 text-base ml-2">chevron_right</span></div></div>';}).join('');}
function switchTab(tab){
  currentTab=tab;
  const tD=document.getElementById('tabDrivers'),tC=document.getElementById('tabConstructors');
  const cmpCtrl=document.getElementById('compareControls');
  if(tab==='drivers'){
    tD.className=tD.className.replace('tab-inactive','tab-active');
    tC.className=tC.className.replace('tab-active','tab-inactive');
  } else {
    tC.className=tC.className.replace('tab-inactive','tab-active');
    tD.className=tD.className.replace('tab-active','tab-inactive');
  }
  if(cmpCtrl)cmpCtrl.style.display='';
  buildCompare();
  buildChart(tab);buildStandings(tab);
}

function buildCompare(){
  const s=SEASONS[currentYear];
  const source=currentTab==='drivers'?s.drivers:s.constructors;
  const selA=document.getElementById('selectA'),selB=document.getElementById('selectB');
  const prevA=selA.value,prevB=selB.value;
  const none='<option value="">—</option>';
  const opts=source.map(d=>`<option value="${d.id}">${d.name}</option>`).join('');
  selA.innerHTML=none+opts;
  selB.innerHTML=none+opts;
  if(source.find(d=>d.id===prevA))selA.value=prevA; else selA.value='';
  if(source.find(d=>d.id===prevB))selB.value=prevB; else selB.value='';
  renderComparison();
}

function renderComparison(){
  buildChart(currentTab); // refresh chart with current filter
  const idA=document.getElementById('selectA').value;
  const idB=document.getElementById('selectB').value;
  const s=SEASONS[currentYear];
  const isDrivers=currentTab==='drivers';
  const source=isDrivers?s.drivers:s.constructors;
  const dA=source.find(d=>d.id===idA),dB=source.find(d=>d.id===idB);
  if(!dA||!dB){document.getElementById('compareResult').innerHTML='';return;}

  const statsA=isDrivers?(calcDriverSeasonStats(idA,currentYear)||{pos:'-',wins:0,podiums:0}):(calcTeamSeasonStats(idA,currentYear)||{pos:'-',wins:0,podiums:0});
  const statsB=isDrivers?(calcDriverSeasonStats(idB,currentYear)||{pos:'-',wins:0,podiums:0}):(calcTeamSeasonStats(idB,currentYear)||{pos:'-',wins:0,podiums:0});

  // head to head: compare cumulative points per race
  let h2hA=0,h2hB=0,tied=0;
  const races=s.completed||s.races.length;
  for(let i=0;i<races;i++){
    const ptA=(dA.cum[i]||0)-(i>0?dA.cum[i-1]||0:0);
    const ptB=(dB.cum[i]||0)-(i>0?dB.cum[i-1]||0:0);
    if(ptA>ptB)h2hA++;else if(ptB>ptA)h2hB++;else tied++;
  }
  const total=h2hA+h2hB+tied||1;
  const barA=Math.round(h2hA/total*100),barB=Math.round(h2hB/total*100);

  function statRow(label,vA,vB,higherWins=true){
    const nA=parseFloat(vA),nB=parseFloat(vB);
    const aWin=higherWins?nA>nB:nA<nB,bWin=higherWins?nB>nA:nB<nA;
    return `<div class="flex items-center py-2 border-b border-white/5 last:border-0">
      <span class="w-1/3 text-right text-sm font-headline font-bold tabular-nums ${aWin?'font-black text-white':bWin?'text-zinc-500':''}" style="${aWin?'color:'+dA.color:''}">${vA}</span>
      <span class="w-1/3 text-center text-[9px] font-headline uppercase tracking-widest text-zinc-600">${label}</span>
      <span class="w-1/3 text-left text-sm font-headline font-bold tabular-nums ${bWin?'font-black text-white':aWin?'text-zinc-500':''}" style="${bWin?'color:'+dB.color:''}">${vB}</span>
    </div>`;
  }

  const infoA=isDrivers?(DRIVERS_INFO[idA]||{}):{};
  const infoB=isDrivers?(DRIVERS_INFO[idB]||{}):{};
  const flagA=infoA.flag?`<span class="fi fi-${infoA.flag} fi-4x3 rounded-sm" style="display:inline-block;width:16px;height:11px;"></span>`:'';
  const flagB=infoB.flag?`<span class="fi fi-${infoB.flag} fi-4x3 rounded-sm" style="display:inline-block;width:16px;height:11px;"></span>`:'';
  const subA=isDrivers?dA.team:'Constructor';
  const subB=isDrivers?dB.team:'Constructor';

  document.getElementById('compareResult').innerHTML=`
  <div class="bg-surface-container-low border border-white/5 p-4 mb-3">
    <div class="flex justify-between items-center mb-4">
      <div class="text-left"><div class="flex items-center gap-1 mb-0.5">${flagA}<span class="text-[9px] text-zinc-500 font-headline uppercase">${subA}</span></div>
        <h3 class="text-base font-headline font-black uppercase tracking-tight" style="color:${dA.color}">${dA.name}</h3></div>
      <span class="text-xs font-headline font-black text-zinc-600 tracking-widest">VS</span>
      <div class="text-right"><div class="flex items-center justify-end gap-1 mb-0.5">${flagB}<span class="text-[9px] text-zinc-500 font-headline uppercase">${subB}</span></div>
        <h3 class="text-base font-headline font-black uppercase tracking-tight" style="color:${dB.color}">${dB.name}</h3></div>
    </div>
    ${statRow('Posición','P'+statsA.pos,'P'+statsB.pos,false)}
    ${statRow('Puntos',dA.total,dB.total)}
    ${statRow('Victorias',statsA.wins,statsB.wins)}
    ${statRow('Podios',statsA.podiums,statsB.podiums)}
  </div>
  <div class="bg-surface-container-low border border-white/5 p-4 mb-3">
    <h4 class="text-[9px] font-headline font-bold uppercase tracking-[0.3em] text-zinc-500 mb-3">Head to Head — ${races} carreras</h4>
    <div class="flex items-center gap-2 mb-1">
      <span class="text-sm font-headline font-black tabular-nums" style="color:${dA.color}">${h2hA}</span>
      <div class="flex-1 h-2 bg-surface-container-high rounded-full overflow-hidden flex">
        <div class="h-full" style="width:${barA}%;background:${dA.color}"></div>
        <div class="h-full ml-auto" style="width:${barB}%;background:${dB.color}"></div>
      </div>
      <span class="text-sm font-headline font-black tabular-nums" style="color:${dB.color}">${h2hB}</span>
    </div>
    ${tied?`<p class="text-[9px] text-zinc-600 text-center mt-1">${tied} empate${tied>1?'s':''}</p>`:''}
  </div>`;
}

// CALENDAR
function buildCalendar(){const cal=CAL_DATA.calendars[currentYear],cts=CAL_DATA.circuits;document.getElementById('calTitle').textContent='SEASON '+currentYear;
document.getElementById('calendarGrid').innerHTML=cal.map((r,i)=>{const c=cts[r.id]||{name:r.id};const fl=FLAGS[r.id]||'';const nm=c.name.replace(' Grand Prix','');const spDot=r.sprint?'<div class="sprint-dot"></div>':'';
return `<div class="gp-card bg-surface-container-low border border-white/5 p-4 flex flex-col items-center justify-between" onclick="openGP(${i})">${spDot}
<div class="text-center"><span class="text-[9px] font-headline font-bold text-zinc-600 uppercase tracking-widest">R${String(r.round).padStart(2,'0')}</span></div>
<div class="flex-1 flex items-center justify-center w-full py-2"><img src="circuits/${r.id}.svg" class="track-svg w-16 h-16 sm:w-20 sm:h-20" style="filter:brightness(0.65)" onerror="this.style.opacity='0'" alt=""></div>
<div class="text-center"><div class="flex justify-center mb-1">${fl?'<span class="fi fi-'+fl+' fi-4x3 rounded-sm border border-white/10" style="display:inline-block;width:28px;height:20px;"></span>':''}</div><h4 class="text-[11px] font-headline font-extrabold uppercase leading-tight tracking-tight">${nm}</h4><p class="text-[9px] text-zinc-500 mt-0.5">${r.date}</p></div></div>`;}).join('');}

// GP DETAIL
function getDriverPts(idx){const s=SEASONS[currentYear];const res=[];for(const d of s.drivers){const prev=idx>0?d.cum[idx-1]:0;const cur=d.cum[idx];const pts=Math.round((cur-prev)*10)/10;if(pts>0)res.push({id:d.id,name:d.name,team:d.team,color:d.color,pts});}res.sort((a,b)=>b.pts-a.pts);return res;}

function openGP(idx){const cal=CAL_DATA.calendars[currentYear];const r=cal[idx];const c=CAL_DATA.circuits[r.id]||{name:r.id,circuit:'',city:'',length:'',turns:'',laps:''};
const fl=FLAGS[r.id]||'';const dp=getDriverPts(idx);
const sprintBadge=r.sprint?'<span class="inline-block bg-secondary/20 text-secondary event-badge border border-secondary/30 mr-2">Sprint Weekend</span>':'';
const eventHtml=r.event?`<div class="bg-surface-container-high border border-white/5 p-3 mt-4"><p class="text-xs text-zinc-300 leading-relaxed">${r.event}</p></div>`:'';
const posData=POSITIONS[currentYear]||{};
const raceDrivers=[];
const s=SEASONS[currentYear];
for(const d of s.drivers){
  const posArr=posData[d.id];
  if(!posArr)continue;
  const posVal=posArr[idx]||"";
  if(posVal==="")continue;
  const prev=idx>0?d.cum[idx-1]:0;const cur=d.cum[idx];
  let pts=Math.round((cur-prev)*10)/10;
  const sprintData=SPRINTS[currentYear]&&SPRINTS[currentYear][String(idx)];
  if(sprintData&&sprintData[d.id]){
    const spPos=parseInt(sprintData[d.id]);
    const spPts=currentYear==='2021'?{1:3,2:2,3:1}:{1:8,2:7,3:6,4:5,5:4,6:3,7:2,8:1};
    const spScore=spPts[spPos]||0;
    pts=Math.round((pts-spScore)*10)/10;
  }
  const rcOverride=(RACE_CONSTRUCTORS&&RACE_CONSTRUCTORS[currentYear]&&RACE_CONSTRUCTORS[currentYear][d.id])?RACE_CONSTRUCTORS[currentYear][d.id][idx]:null;
  const raceConstr=rcOverride?s.constructors.find(c=>c.id===rcOverride):null;
  const raceTeam=raceConstr?raceConstr.name:d.team;
  const raceColor=raceConstr?raceConstr.color:d.color;
  raceDrivers.push({id:d.id,name:d.name,team:raceTeam,color:raceColor,pos:posVal,pts:pts});
}
// Sort: numbered positions first (ascending), then R, DSQ, DNS
const sortOrder={"R":1,"DSQ":2,"DNS":3};
raceDrivers.sort((a,b)=>{
  const na=parseInt(a.pos),nb=parseInt(b.pos);
  const aIsNum=!isNaN(na),bIsNum=!isNaN(nb);
  if(aIsNum&&bIsNum)return na-nb;
  if(aIsNum)return -1;
  if(bIsNum)return 1;
  return (sortOrder[a.pos]||9)-(sortOrder[b.pos]||9);
});
const rows=raceDrivers.map((d,i)=>{
  const isTop3=!isNaN(parseInt(d.pos))&&parseInt(d.pos)<=3;
  const posColor=d.pos==="1"?"text-[#FFD700]":d.pos==="2"?"text-[#C0C0C0]":d.pos==="3"?"text-[#CD7F32]":isNaN(parseInt(d.pos))?"text-red-400":"text-zinc-500";
  const bg=d.pos==="1"?"bg-surface-container-high":"";
  const ptsStr=d.pts>0?"+"+d.pts:"0";
  const ptsColor=d.pts>0?"text-primary":"text-zinc-600";
  const posLabel=isNaN(parseInt(d.pos))?d.pos:"P"+d.pos;
  return `<div class="flex items-center justify-between py-2 px-3 ${bg} border-b border-white/5 last:border-0 cursor-pointer hover:bg-surface-container-high transition-colors" onclick="openDriverDetail('${d.id}')"><div class="flex items-center gap-2"><span class="text-xs font-headline font-black tabular-nums ${posColor} w-7 text-center">${posLabel}</span><div class="w-1 h-5" style="background:${d.color}"></div><div><span class="text-xs font-headline font-bold uppercase">${d.id}</span><span class="text-[10px] text-zinc-500 ml-1.5 hidden sm:inline">${d.team}</span></div></div><span class="text-sm font-headline font-bold tabular-nums ${ptsColor}">${ptsStr}</span></div>`;
}).join('');
const noPts=raceDrivers.length===0?'<p class="text-xs text-zinc-500 italic py-4 text-center">Sin datos</p>':'';

const hasPrev=idx>0,hasNext=idx<cal.length-1;
const prevBtn=hasPrev?`<button onclick="openGP(${idx-1})" class="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors"><span class="material-symbols-outlined">arrow_back_ios</span></button>`:`<span class="w-8"></span>`;
const nextBtn=hasNext?`<button onclick="openGP(${idx+1})" class="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors"><span class="material-symbols-outlined">arrow_forward_ios</span></button>`:`<span class="w-8"></span>`;
document.getElementById('gpDetailContent').innerHTML=`<div class="page-transition">
<div class="flex items-center justify-between mb-4 px-1">
${prevBtn}
<span class="text-[10px] font-headline font-bold uppercase tracking-widest text-zinc-500">R${r.round} / ${cal.length}</span>
${nextBtn}
</div>
<div class="bg-surface-container-low border border-white/5 p-6 relative overflow-hidden mb-4">
<div class="absolute top-4 right-4 opacity-10"><img src="circuits/${r.id}.svg" class="w-28 h-28" onerror="this.style.opacity='0'" alt=""></div>
<div class="flex items-center gap-2 mb-2">${fl?'<span class="fi fi-'+fl+' fi-4x3" style="display:inline-block;width:36px;height:24px;vertical-align:middle;border-radius:2px;"></span>':''}<span class="text-[10px] font-headline font-bold text-secondary uppercase tracking-[0.2em]">Ronda ${r.round} · ${currentYear}</span></div>
<h2 class="text-2xl font-headline font-bold tracking-tighter uppercase">${c.name}</h2>
<p class="text-sm text-zinc-400 mt-1">${c.circuit}</p>
<p class="text-xs text-zinc-500">${c.city} · ${r.date}</p>
<div class="mt-3">${sprintBadge}</div>
${eventHtml}</div>
<div class="grid grid-cols-3 gap-3 mb-4">
<div class="bg-surface-container-low border border-white/5 p-4 text-center"><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Longitud</span><span class="text-lg font-headline font-bold">${c.length}</span></div>
<div class="bg-surface-container-low border border-white/5 p-4 text-center"><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Curvas</span><span class="text-lg font-headline font-bold">${c.turns}</span></div>
<div class="bg-surface-container-low border border-white/5 p-4 text-center"><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Vueltas</span><span class="text-lg font-headline font-bold">${c.laps}</span></div></div>
<div class="bg-surface-container-low border border-white/5 p-6 mb-4 flex items-center justify-center">
<img src="circuits/${r.id}.svg" class="w-48 h-48" style="filter:brightness(0.65)" onerror="this.style.opacity='0'" alt="${c.name}"></div>
<div id="gpClassifications">
${(function(){
  const sprintData=SPRINTS[currentYear]&&SPRINTS[currentYear][String(idx)];
  let sprintHtml='';
  if(sprintData){
    const spDrivers=[];
    for(const d of s.drivers){
      const sp=sprintData[d.id];
      if(!sp)continue;
      spDrivers.push({id:d.id,name:d.name,team:d.team,color:d.color,pos:sp});
    }
    const sOrd={"R":1,"DSQ":2,"DNS":3};
    spDrivers.sort((a,b)=>{const na=parseInt(a.pos),nb=parseInt(b.pos),aI=!isNaN(na),bI=!isNaN(nb);if(aI&&bI)return na-nb;if(aI)return -1;if(bI)return 1;return(sOrd[a.pos]||9)-(sOrd[b.pos]||9);});
    const spPts=currentYear==='2021'?{1:3,2:2,3:1}:{1:8,2:7,3:6,4:5,5:4,6:3,7:2,8:1};
    const spRows=spDrivers.map((d,i)=>{
      const p=parseInt(d.pos);const pts=spPts[p]||0;
      const posColor=d.pos==='1'?'text-[#FFD700]':d.pos==='2'?'text-[#C0C0C0]':d.pos==='3'?'text-[#CD7F32]':isNaN(p)?'text-red-400':'text-zinc-500';
      const bg=d.pos==='1'?'bg-surface-container-high':'';
      const ptsStr=pts>0?'+'+pts:'0';
      const ptsColor=pts>0?'text-secondary':'text-zinc-600';
      const posLabel=isNaN(p)?d.pos:'P'+d.pos;
      return '<div class="flex items-center justify-between py-2 px-3 '+bg+' border-b border-white/5 last:border-0 cursor-pointer hover:bg-surface-container-high transition-colors" onclick="openDriverDetail(\''+d.id+'\')"><div class="flex items-center gap-2"><span class="text-xs font-headline font-black tabular-nums '+posColor+' w-7 text-center">'+posLabel+'</span><div class="w-1 h-5" style="background:'+d.color+'"></div><div><span class="text-xs font-headline font-bold uppercase">'+d.id+'</span><span class="text-[10px] text-zinc-500 ml-1.5 hidden sm:inline">'+d.team+'</span></div></div><span class="text-sm font-headline font-bold tabular-nums '+ptsColor+'">'+ptsStr+'</span></div>';
    }).join('');
    sprintHtml='<div class="bg-surface-container-low border border-white/5 mb-4"><div class="p-4 border-b border-white/5 flex items-center gap-2"><div class="w-2 h-2 bg-secondary rounded-full"></div><h3 class="text-[10px] font-headline font-bold uppercase tracking-[0.3em] text-secondary">Sprint</h3></div>'+spRows+'</div>';
  }
  return sprintHtml;
})()}
<div class="bg-surface-container-low border border-white/5"><div class="p-4 border-b border-white/5"><h3 class="text-[10px] font-headline font-bold uppercase tracking-[0.3em] text-zinc-500">Carrera</h3></div>${rows}${noPts}</div></div>`;
showPage('gpdetail');}

function updateSeasonStatus(){const st=document.getElementById('seasonStatus');if(!st)return;const s=SEASONS[currentYear];if(s.completed){st.style.display='none';}else{st.style.display='flex';st.innerHTML='<span class="text-sm font-headline font-bold">FINALIZADO</span><span class="material-symbols-outlined text-sm">flag</span>';}}


// Mapa displayName → id (para convertir el string del driver.team en id del constructor)
function teamIdFromName(nm){
  if(!nm)return null;
  const parts=nm.split(/\s*\/\s*/).map(p=>p.trim());
  // Manejar valores compuestos: priorizar el equipo principal (el último del string, que suele ser el destino final)
  for(let i=parts.length-1;i>=0;i--){
    const p=parts[i];
    for(const id in TEAMS_INFO){
      if(TEAMS_INFO[id].displayName===p)return id;
    }
    if(p==='RB')return 'RBT';
  }
  return null;
}
function resolveTeamId(teamName,year){
  const fromInfo=teamIdFromName(teamName);if(fromInfo)return fromInfo;
  const s=SEASONS[year];if(s){const c=s.constructors.find(c=>c.name===teamName);if(c)return c.id;}
  return '';
}



// ============ CÁLCULO DE ESTADÍSTICAS POR TEMPORADA ============
function calcDriverSeasonStats(driverId,year){
const s=SEASONS[year];if(!s)return null;
const dr=s.drivers.find(d=>d.id===driverId);if(!dr)return null;
const posData=POSITIONS[year]||{};const posArr=posData[driverId]||[];
const sprintYear=SPRINTS[year]||{};
let wins=0,podiums=0,top10=0,dnf=0,races=0,bestResult=null;
for(let i=0;i<posArr.length;i++){
  const p=posArr[i];if(p===""||p===undefined)continue;
  races++;
  if(p==="R"||p==="DSQ"||p==="DNS"){dnf++;continue;}
  const n=parseInt(p);if(isNaN(n))continue;
  if(n===1)wins++;
  if(n<=3)podiums++;
  if(n<=10)top10++;
  if(bestResult===null||n<bestResult)bestResult=n;
}
const chPos=s.drivers.findIndex(d=>d.id===driverId)+1;
let sprintWins=0,sprintPodiums=0;
for(const raceIdx in sprintYear){
  const sp=sprintYear[raceIdx];if(!sp||!sp[driverId])continue;
  const n=parseInt(sp[driverId]);if(isNaN(n))continue;
  if(n===1)sprintWins++;
  if(n<=3)sprintPodiums++;
}
return{points:dr.total,pos:chPos,team:dr.team,color:dr.color,wins,podiums,top10,dnf,races,bestResult,sprintWins,sprintPodiums};
}

function calcTeamSeasonStats(teamId,year){
const s=SEASONS[year];if(!s)return null;
const tm=s.constructors.find(t=>t.id===teamId);if(!tm)return null;
const drivers=s.drivers.filter(d=>teamIdFromName(d.team)===teamId||d.team===tm.name);
let wins=0,podiums=0,top10=0,onetwos=0,dnf=0,bestResult=null;
const posData=POSITIONS[year]||{};
const numRaces=s.races.length;
for(let i=0;i<numRaces;i++){
  const racePositions=[];
  for(const d of drivers){
    const arr=posData[d.id]||[];const p=arr[i];if(p===""||p===undefined)continue;
    if(p==="R"||p==="DSQ"||p==="DNS"){dnf++;continue;}
    const n=parseInt(p);if(isNaN(n))continue;
    racePositions.push(n);
    if(n===1)wins++;
    if(n<=3)podiums++;
    if(n<=10)top10++;
    if(bestResult===null||n<bestResult)bestResult=n;
  }
  if(racePositions.includes(1)&&racePositions.includes(2))onetwos++;
}
const chPos=s.constructors.findIndex(t=>t.id===teamId)+1;
return{points:tm.total,pos:chPos,color:tm.color,name:tm.name,drivers:drivers.map(d=>({id:d.id,name:d.name,color:d.color})),wins,podiums,top10,onetwos,dnf,bestResult,numRaces};
}

// Últimos 5 resultados del piloto en el año activo
function getLastResults(driverId,year,limit){
const s=SEASONS[year];if(!s)return[];
const cal=CAL_DATA.calendars[year]||[];
const posData=POSITIONS[year]||{};const arr=posData[driverId]||[];
const results=[];
for(let i=arr.length-1;i>=0&&results.length<(limit||5);i--){
  const p=arr[i];if(p===""||p===undefined)continue;
  const race=cal[i];if(!race)continue;
  const cts=CAL_DATA.circuits[race.id]||{};
  results.push({idx:i,pos:p,raceName:(cts.name||race.id).replace(" Grand Prix",""),date:race.date,flag:FLAGS[race.id]||""});
}
return results;
}

// ============ RENDER DE FICHA DE PILOTO ============
function openDriverDetail(driverId){
const info=DRIVERS_INFO[driverId];
const stats=calcDriverSeasonStats(driverId,currentYear);
const nameStr=info?info.name:driverId;
const flagStr=info?info.flag:"";
const numStr=info?info.num:"—";
const natStr=info?info.nat:"—";
const dobStr=info?info.dob:"";
const age=dobStr?Math.floor((new Date()-new Date(dobStr))/(365.25*24*60*60*1000)):"—";
const debutStr=info?info.debut:"—";
const bioStr=info?info.bio:"";
const color=stats?stats.color:"#ffb4a7";
let hero='<div class="detail-hero bg-surface-container-low border border-white/5 p-6 relative mb-4" style="--accent-color:'+color+'">'+
'<div class="absolute top-0 left-0 w-1 h-full" style="background:'+color+'"></div>'+
'<div class="flex items-start justify-between mb-3">'+
'<div class="flex items-center gap-2">'+(flagStr?'<span class="fi fi-'+flagStr+' fi-4x3 rounded-sm" style="display:inline-block;width:40px;height:28px;"></span>':'')+' <div><span class="text-[10px] font-headline font-bold text-secondary uppercase tracking-[0.2em]">Piloto · '+currentYear+'</span><h2 class="text-2xl font-headline font-black uppercase tracking-tighter leading-tight mt-1">'+nameStr+'</h2></div></div>'+
'<span class="text-5xl font-headline font-black italic leading-none stat-num" style="color:'+color+'">'+numStr+'</span></div>'+
(stats?'<p class="text-xs text-zinc-400 uppercase tracking-widest font-headline clickable-name" onclick="openTeamDetail(\''+resolveTeamId(stats.team,currentYear)+'\')">'+stats.team+' <span class="material-symbols-outlined text-xs align-middle">chevron_right</span></p>':'<p class="text-xs text-zinc-500 italic">Sin datos en '+currentYear+'</p>')+
'</div>';
let bioBox='<div class="bg-surface-container-low border border-white/5 p-4 mb-4"><div class="grid grid-cols-3 gap-3 mb-3">'+
'<div><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Nacionalidad</span><span class="text-xs font-headline font-bold">'+natStr+'</span></div>'+
'<div><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Edad</span><span class="text-xs font-headline font-bold">'+age+' años</span></div>'+
'<div><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Debut F1</span><span class="text-xs font-headline font-bold">'+debutStr+'</span></div>'+
'</div><p class="text-xs text-zinc-300 leading-relaxed">'+bioStr+'</p></div>';
let seasonBox='';
if(stats){
  const br=stats.bestResult?'P'+stats.bestResult:'—';
  seasonBox='<div class="mb-4"><h3 class="text-[10px] font-headline font-bold uppercase tracking-[0.3em] text-zinc-500 mb-3">Temporada '+currentYear+'</h3>'+
  '<div class="grid grid-cols-2 gap-2 mb-2">'+
  '<div class="bg-surface-container-low border border-white/5 p-4"><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Campeonato</span><span class="text-2xl stat-num" style="color:'+color+'">P'+stats.pos+'</span></div>'+
  '<div class="bg-surface-container-low border border-white/5 p-4"><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Puntos</span><span class="text-2xl stat-num text-primary">'+stats.points+'</span></div>'+
  '</div><div class="grid grid-cols-4 gap-2">'+
  '<div class="bg-surface-container-low border border-white/5 p-3 text-center"><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Vict.</span><span class="text-lg stat-num">'+stats.wins+'</span></div>'+
  '<div class="bg-surface-container-low border border-white/5 p-3 text-center"><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Podios</span><span class="text-lg stat-num">'+stats.podiums+'</span></div>'+
  '<div class="bg-surface-container-low border border-white/5 p-3 text-center"><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Mejor</span><span class="text-lg stat-num">'+br+'</span></div>'+
  '<div class="bg-surface-container-low border border-white/5 p-3 text-center"><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">DNF</span><span class="text-lg stat-num text-red-400">'+stats.dnf+'</span></div>'+
  '</div>'+
  (stats.sprintWins>0||stats.sprintPodiums>0?'<div class="grid grid-cols-2 gap-2 mt-2"><div class="bg-surface-container-low border border-secondary/20 p-3 text-center"><span class="text-[9px] text-secondary uppercase tracking-widest block font-headline mb-1">Sprint Vict.</span><span class="text-lg stat-num">'+stats.sprintWins+'</span></div><div class="bg-surface-container-low border border-secondary/20 p-3 text-center"><span class="text-[9px] text-secondary uppercase tracking-widest block font-headline mb-1">Sprint Podios</span><span class="text-lg stat-num">'+stats.sprintPodiums+'</span></div></div>':'')+
  '</div>';
}
// Últimos resultados
let lastResults='';
if(stats){
  const last=getLastResults(driverId,currentYear,5);
  if(last.length>0){
    lastResults='<div class="mb-4"><h3 class="text-[10px] font-headline font-bold uppercase tracking-[0.3em] text-zinc-500 mb-3">Últimos resultados</h3><div class="bg-surface-container-low border border-white/5">';
    last.forEach((r,i)=>{
      const isNum=!isNaN(parseInt(r.pos));
      const pc=r.pos==="1"?"text-[#FFD700]":r.pos==="2"?"text-[#C0C0C0]":r.pos==="3"?"text-[#CD7F32]":isNum?"text-zinc-500":"text-red-400";
      const posL=isNum?"P"+r.pos:r.pos;
      const flagBox=r.flag?'<span class="fi fi-'+r.flag+' fi-4x3 border border-white/10" style="display:inline-block;width:24px;height:16px;border-radius:2px;flex-shrink:0;"></span>':'';
      lastResults+='<div class="flex items-center justify-between py-2 px-3 border-b border-white/5 last:border-0 cursor-pointer hover:bg-surface-container-high transition-colors" onclick="openGP('+r.idx+')"><div class="flex items-center gap-2">'+flagBox+'<div><span class="text-xs font-headline font-bold uppercase">'+r.raceName+'</span><span class="text-[9px] text-zinc-600 ml-1.5">'+r.date+'</span></div></div><span class="text-sm font-headline font-black tabular-nums '+pc+'">'+posL+'</span></div>';
    });
    lastResults+='</div></div>';
  }
}
// Trayectoria PIT WALL (todos los años)
let trajectory='<div class="mb-4"><h3 class="text-[10px] font-headline font-bold uppercase tracking-[0.3em] text-zinc-500 mb-3">Trayectoria PIT WALL</h3><div class="bg-surface-container-low border border-white/5">';
const years=Object.keys(SEASONS).sort();
const trajData=[];
let hasData=false;
years.forEach(y=>{
  const st=calcDriverSeasonStats(driverId,y);
  if(st){hasData=true;trajData.push({year:y,...st});
    const isActiveYear=y===currentYear;
    const bg=isActiveYear?'bg-surface-container-high':'';
    trajectory+='<div class="season-row flex items-center justify-between py-3 px-3 border-b border-white/5 last:border-0 '+bg+'" onclick="changeYear(\''+y+'\');showPage(\'standings\');"><div class="flex items-center gap-3"><span class="text-sm font-headline font-black italic stat-num" style="color:'+st.color+'">'+y+'</span><div><span class="text-[10px] font-headline font-bold uppercase">'+st.team+'</span><span class="block text-[9px] text-zinc-600">P'+st.pos+' · '+st.wins+'V · '+st.podiums+'P</span></div></div><span class="text-sm font-headline font-bold tabular-nums text-primary">'+st.points+' pts</span></div>';
  }
});
trajectory+='</div>';
if(!hasData){trajectory='<div class="mb-4"><p class="text-xs text-zinc-500 italic text-center py-4">Sin datos históricos</p></div>';}
// Totales agregados
let totals='';
if(hasData&&trajData.length>1){
  const tp=trajData.reduce((a,b)=>a+b.points,0);
  const tw=trajData.reduce((a,b)=>a+b.wins,0);
  const tpd=trajData.reduce((a,b)=>a+b.podiums,0);
  const tr=trajData.reduce((a,b)=>a+b.races,0);
  totals='<div class="grid grid-cols-4 gap-2 mt-3"><div class="bg-surface-container-lowest border border-white/5 p-3 text-center"><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">GPs</span><span class="text-lg stat-num">'+tr+'</span></div><div class="bg-surface-container-lowest border border-white/5 p-3 text-center"><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Puntos</span><span class="text-lg stat-num text-primary">'+tp+'</span></div><div class="bg-surface-container-lowest border border-white/5 p-3 text-center"><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Vict.</span><span class="text-lg stat-num">'+tw+'</span></div><div class="bg-surface-container-lowest border border-white/5 p-3 text-center"><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Podios</span><span class="text-lg stat-num">'+tpd+'</span></div></div>';
}
trajectory+=totals+'</div>';
document.getElementById('driverDetailContent').innerHTML=hero+bioBox+seasonBox+lastResults+trajectory;
showPage('driver');
}

// ============ RENDER DE FICHA DE EQUIPO ============
function openTeamDetail(teamId){
const info=TEAMS_INFO[teamId];
const stats=calcTeamSeasonStats(teamId,currentYear);
const displayName=info?info.displayName:(stats?stats.name:teamId);
const fullName=info?info.name:displayName;
const baseStr=info?info.base:"—";
const principal=info?info.principal:"—";
const founded=info?info.founded:"—";
const engine=info?info.engine:"—";
const bioStr=info?info.bio:"";
const color=stats?stats.color:"#ffb4a7";
let hero='<div class="detail-hero bg-surface-container-low border border-white/5 p-6 relative mb-4" style="--accent-color:'+color+'">'+
'<div class="absolute top-0 left-0 w-1 h-full" style="background:'+color+'"></div>'+
'<span class="text-[10px] font-headline font-bold text-secondary uppercase tracking-[0.2em]">Constructor · '+currentYear+'</span>'+
'<h2 class="text-2xl font-headline font-black uppercase tracking-tighter leading-tight mt-1 mb-2">'+displayName+'</h2>'+
'<p class="text-xs text-zinc-400">'+fullName+'</p>'+
'</div>';
let bioBox='<div class="bg-surface-container-low border border-white/5 p-4 mb-4"><div class="grid grid-cols-2 gap-3 mb-3">'+
'<div><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Base</span><span class="text-xs font-headline font-bold">'+baseStr+'</span></div>'+
'<div><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Director</span><span class="text-xs font-headline font-bold">'+principal+'</span></div>'+
'<div><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Fundación</span><span class="text-xs font-headline font-bold">'+founded+'</span></div>'+
'<div><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Motor</span><span class="text-xs font-headline font-bold">'+engine+'</span></div>'+
'</div><p class="text-xs text-zinc-300 leading-relaxed">'+bioStr+'</p></div>';
// Pilotos actuales
let driversBox='';
if(stats&&stats.drivers.length>0){
  driversBox='<div class="mb-4"><h3 class="text-[10px] font-headline font-bold uppercase tracking-[0.3em] text-zinc-500 mb-3">Pilotos '+currentYear+'</h3><div class="space-y-2">';
  stats.drivers.forEach(d=>{
    const dInfo=DRIVERS_INFO[d.id]||{};
    driversBox+='<div class="entity-pill bg-surface-container-low border border-white/5 flex items-center p-3" onclick="openDriverDetail(\''+d.id+'\')"><div class="w-1 h-9 mr-3" style="background:'+d.color+'"></div><div class="flex-1"><span class="text-sm font-headline font-bold uppercase block">'+d.name+'</span><span class="text-[10px] text-zinc-500">'+(dInfo.flag?'<span class="fi fi-'+dInfo.flag+' fi-4x3 rounded-sm" style="display:inline-block;width:16px;height:11px;"></span> ':'')+' '+(dInfo.nat||"")+' · #'+(dInfo.num||"?")+'</span></div><span class="material-symbols-outlined text-zinc-600">chevron_right</span></div>';
  });
  driversBox+='</div></div>';
}
// Stats de temporada
let seasonBox='';
if(stats){
  const br=stats.bestResult?'P'+stats.bestResult:'—';
  seasonBox='<div class="mb-4"><h3 class="text-[10px] font-headline font-bold uppercase tracking-[0.3em] text-zinc-500 mb-3">Temporada '+currentYear+'</h3>'+
  '<div class="grid grid-cols-2 gap-2 mb-2">'+
  '<div class="bg-surface-container-low border border-white/5 p-4"><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Campeonato</span><span class="text-2xl stat-num" style="color:'+color+'">P'+stats.pos+'</span></div>'+
  '<div class="bg-surface-container-low border border-white/5 p-4"><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Puntos</span><span class="text-2xl stat-num text-primary">'+stats.points+'</span></div>'+
  '</div><div class="grid grid-cols-4 gap-2">'+
  '<div class="bg-surface-container-low border border-white/5 p-3 text-center"><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Vict.</span><span class="text-lg stat-num">'+stats.wins+'</span></div>'+
  '<div class="bg-surface-container-low border border-white/5 p-3 text-center"><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Podios</span><span class="text-lg stat-num">'+stats.podiums+'</span></div>'+
  '<div class="bg-surface-container-low border border-white/5 p-3 text-center"><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">1-2</span><span class="text-lg stat-num">'+stats.onetwos+'</span></div>'+
  '<div class="bg-surface-container-low border border-white/5 p-3 text-center"><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Mejor</span><span class="text-lg stat-num">'+br+'</span></div>'+
  '</div></div>';
}
// Trayectoria PIT WALL
let trajectory='<div class="mb-4"><h3 class="text-[10px] font-headline font-bold uppercase tracking-[0.3em] text-zinc-500 mb-3">Trayectoria PIT WALL</h3><div class="bg-surface-container-low border border-white/5">';
const years=Object.keys(SEASONS).sort();
const trajData=[];
let hasData=false;
years.forEach(y=>{
  const st=calcTeamSeasonStats(teamId,y);
  if(st){hasData=true;trajData.push({year:y,...st});
    const isActiveYear=y===currentYear;
    const bg=isActiveYear?'bg-surface-container-high':'';
    const champBadge=SEASONS[y].champion_constructor===teamId?'<span class="champion-badge ml-2">Campeón</span>':'';
    trajectory+='<div class="season-row flex items-center justify-between py-3 px-3 border-b border-white/5 last:border-0 '+bg+'" onclick="changeYear(\''+y+'\');showPage(\'standings\');"><div class="flex items-center gap-3"><span class="text-sm font-headline font-black italic stat-num" style="color:'+st.color+'">'+y+'</span><div class="flex items-center"><span class="text-[10px] font-headline font-bold uppercase">P'+st.pos+' · '+st.wins+'V · '+st.podiums+'P</span>'+champBadge+'</div></div><span class="text-sm font-headline font-bold tabular-nums text-primary">'+st.points+' pts</span></div>';
  }
});
trajectory+='</div>';
if(!hasData){trajectory='<div class="mb-4"><p class="text-xs text-zinc-500 italic text-center py-4">Sin datos históricos</p></div>';}
// Totales
let totals='';
if(hasData&&trajData.length>1){
  const tp=trajData.reduce((a,b)=>a+b.points,0);
  const tw=trajData.reduce((a,b)=>a+b.wins,0);
  const tpd=trajData.reduce((a,b)=>a+b.podiums,0);
  const titles=trajData.filter(d=>SEASONS[d.year].champion_constructor===teamId).length;
  totals='<div class="grid grid-cols-4 gap-2 mt-3"><div class="bg-surface-container-lowest border border-white/5 p-3 text-center"><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Títulos</span><span class="text-lg stat-num text-primary">'+titles+'</span></div><div class="bg-surface-container-lowest border border-white/5 p-3 text-center"><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Puntos</span><span class="text-lg stat-num">'+tp+'</span></div><div class="bg-surface-container-lowest border border-white/5 p-3 text-center"><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Vict.</span><span class="text-lg stat-num">'+tw+'</span></div><div class="bg-surface-container-lowest border border-white/5 p-3 text-center"><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">Podios</span><span class="text-lg stat-num">'+tpd+'</span></div></div>';
}
trajectory+=totals+'</div>';
document.getElementById('teamDetailContent').innerHTML=hero+bioBox+driversBox+seasonBox+trajectory;
showPage('team');
}

function renderDonut(canvasId,labels,data,colors,legendId,prevChart){
  if(prevChart)prevChart.destroy();
  const leg=document.getElementById(legendId);
  if(!data.length){
    if(leg)leg.innerHTML='<p class="text-[10px] text-zinc-600 text-center">Sin victorias aún</p>';
    return null;
  }
  const ctx=document.getElementById(canvasId).getContext('2d');
  const ch=new Chart(ctx,{
    type:'doughnut',
    data:{labels,datasets:[{data,backgroundColor:colors,borderColor:'#121314',borderWidth:2,hoverBorderColor:'#ffffff',hoverBorderWidth:1.5}]},
    options:{responsive:true,maintainAspectRatio:true,aspectRatio:1,cutout:'62%',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${c.raw} ${c.raw===1?'victoria':'victorias'}`},backgroundColor:'#1b1c1d',titleColor:'#e3e2e3',bodyColor:'#a1a1aa',borderColor:'#3f3f46',borderWidth:1}}}
  });
  if(leg)leg.innerHTML=labels.map((l,i)=>`<div class="flex items-center gap-1.5 min-w-0"><span class="w-2 h-2 rounded-full shrink-0" style="background:${colors[i]}"></span><span class="text-[10px] font-headline uppercase tracking-wide text-zinc-300 truncate">${l}</span><span class="text-[10px] text-zinc-500 ml-auto shrink-0 pl-1">${data[i]}</span></div>`).join('');
  return ch;
}

function buildHome(){
  const s=SEASONS[currentYear];
  if(!s)return;
  const pos=POSITIONS[currentYear]||{};
  // Count wins per driver and per team
  const dWins={},tWins={},tColors={};
  for(const d of s.drivers){
    const results=pos[d.id]||[];
    for(let i=0;i<results.length;i++){
      if(results[i]!=='1')continue;
      dWins[d.id]=(dWins[d.id]||0)+1;
      const rcId=RACE_CONSTRUCTORS&&RACE_CONSTRUCTORS[currentYear]&&RACE_CONSTRUCTORS[currentYear][d.id]?RACE_CONSTRUCTORS[currentYear][d.id][i]:null;
      let tName=d.team,tColor=d.color;
      if(rcId){const tObj=s.constructors.find(c=>c.id===rcId);if(tObj){tName=tObj.name;tColor=tObj.color;}}
      tWins[tName]=(tWins[tName]||0)+1;
      if(!tColors[tName])tColors[tName]=tColor;
    }
  }
  const cal=CAL_DATA.calendars[currentYear]||[];
  const racesDone=s.completed!==undefined?s.completed:s.races.length;
  // Champion or current leader
  const done=!!s.champion_driver;
  const champDId=done?s.champion_driver:(s.drivers.reduce((a,b)=>b.total>a.total?b:a,s.drivers[0])?.id||'');
  const champCId=done?s.champion_constructor:(s.constructors.reduce((a,b)=>b.total>a.total?b:a,s.constructors[0])?.id||'');
  const champDObj=s.drivers.find(d=>d.id===champDId);
  const champCObj=s.constructors.find(c=>c.id===champCId);
  const champDInfo=DRIVERS_INFO[champDId];
  const driverName=champDInfo?champDInfo.name:(champDObj?champDObj.name:champDId);
  const driverFlag=champDInfo?champDInfo.flag:'';
  const driverTeam=champDObj?champDObj.team:'';
  const driverColor=champDObj?champDObj.color:'#ffffff';
  const constrName=champCObj?champCObj.name:(champCId||'—');
  const constrColor=champCObj?champCObj.color:'#ffffff';
  const doneLabel=done?'CAMPEÓN':'LÍDER';
  const flagHtml=driverFlag?`<span class="fi fi-${driverFlag} fi-4x3" style="display:inline-block;width:36px;height:24px;border-radius:2px;flex-shrink:0"></span>`:'';
  const constrFlagKey=Object.keys(FLAGS||{}).find(k=>FLAGS[k]&&s.constructors.find(c=>c.id===champCId));
  document.getElementById('homeChampion').innerHTML=`
    <div class="grid grid-cols-2 gap-3">
      <div class="bg-surface-container-low p-4 relative overflow-hidden" style="border-top:2px solid ${driverColor}">
        <div class="absolute top-0 right-0 w-16 h-16 bg-primary/5 -rotate-45 translate-x-8 -translate-y-8"></div>
        <span class="text-[9px] font-headline font-bold uppercase tracking-[0.2em] text-secondary block mb-2">${doneLabel} — Piloto</span>
        <div class="flex items-center gap-2 mb-1">
          ${flagHtml}
          <h2 class="text-base font-headline font-black uppercase tracking-tight leading-tight truncate">${driverName}</h2>
        </div>
        <p class="text-[10px] font-headline uppercase tracking-widest truncate" style="color:${driverColor}">${driverTeam}</p>
      </div>
      <div class="bg-surface-container-low p-4 relative overflow-hidden" style="border-top:2px solid ${constrColor}">
        <div class="absolute top-0 right-0 w-16 h-16 bg-primary/5 -rotate-45 translate-x-8 -translate-y-8"></div>
        <span class="text-[9px] font-headline font-bold uppercase tracking-[0.2em] text-secondary block mb-2">${doneLabel} — Constructor</span>
        <h2 class="text-base font-headline font-black uppercase tracking-tight leading-tight truncate mt-1" style="color:${constrColor}">${constrName}</h2>
        <p class="text-[10px] font-headline uppercase tracking-widest text-zinc-500 mt-1 truncate">${currentYear}</p>
      </div>
    </div>`;
  // Last GP podium
  const lastGPEl=document.getElementById('homeLastGP');
  if(lastGPEl){
    const lastIdx=racesDone-1;
    if(lastIdx<0){lastGPEl.innerHTML='';}
    else{
      const r=cal[lastIdx];
      const circuit=CAL_DATA.circuits[r.id]||{};
      const gpName=circuit.name||r.id;
      const fl=FLAGS&&FLAGS[r.id];
      const flagHtml=fl?`<span class="fi fi-${fl} fi-4x3" style="display:inline-block;width:18px;height:12px;border-radius:1px;vertical-align:middle;margin-right:4px"></span>`:'';
      // Find P1 P2 P3
      const podium=[null,null,null];
      for(const d of s.drivers){
        const p=(pos[d.id]||[])[lastIdx];
        if(p==='1'||p==='2'||p==='3'){
          const pIdx=parseInt(p)-1;
          const rcId=RACE_CONSTRUCTORS&&RACE_CONSTRUCTORS[currentYear]&&RACE_CONSTRUCTORS[currentYear][d.id]?RACE_CONSTRUCTORS[currentYear][d.id][lastIdx]:null;
          const tObj=rcId?s.constructors.find(c=>c.id===rcId):null;
          const color=tObj?tObj.color:d.color;
          const team=tObj?tObj.name:d.team;
          const pts=Math.round(((d.cum[lastIdx]||0)-(lastIdx>0?d.cum[lastIdx-1]||0:0))*10)/10;
          const info=DRIVERS_INFO[d.id];
          podium[pIdx]={name:info?info.name:d.name,color,team,pts};
        }
      }
      const podiumColors=['#C9A84C','#A0A0A0','#A0522D'];
      const podiumBg=['#C9A84C18','#A0A0A018','#A0522D18'];
      const p1=podium[0];
      const miniCard=(p,rank)=>{
        const pc=podiumColors[rank-1];
        const pb=podiumBg[rank-1];
        if(!p)return`<div class="p-3 flex items-center justify-center mt-2" style="background:${pb};border-top:2px solid ${pc}"><span class="text-zinc-600 text-xs">—</span></div>`;
        return`<div class="p-2.5 relative overflow-hidden mt-2" style="background:${pb};border-top:2px solid ${pc}">
          <span class="text-[7px] font-headline font-bold block mb-0.5" style="color:${pc}">P${rank}</span>
          <p class="text-[11px] font-headline font-black uppercase tracking-tight leading-tight truncate">${p.name}</p>
          <p class="text-[8px] font-headline uppercase tracking-wide mt-0.5 truncate" style="color:${p.color}">${p.team}</p>
          <span class="block text-[9px] font-headline font-bold text-zinc-400 mt-1">+${p.pts} pts</span>
        </div>`;
      };
      lastGPEl.innerHTML=`
        <div class="mb-2 flex items-center justify-between">
          <span class="text-[9px] font-headline font-bold uppercase tracking-[0.2em] text-zinc-500">Último GP</span>
          <span class="text-[9px] font-headline text-zinc-500">${flagHtml}R${r.round}</span>
        </div>
        <div class="p-4 relative overflow-hidden" style="background:${podiumBg[0]};border-top:2px solid ${podiumColors[0]}">
          <div class="absolute top-0 right-0 w-16 h-16 -rotate-45 translate-x-8 -translate-y-8" style="background:${podiumColors[0]}18"></div>
          <span class="text-[8px] font-headline font-bold block mb-2" style="color:${podiumColors[0]}">P1 · ${gpName}</span>
          <h3 class="text-lg font-headline font-black uppercase tracking-tight leading-tight">${p1?p1.name:'—'}</h3>
          <p class="text-[10px] font-headline uppercase tracking-wider mt-1.5 truncate" style="color:${p1?p1.color:'#888'}">${p1?p1.team:''}</p>
          ${p1?`<span class="block text-[11px] font-headline font-bold text-zinc-400 mt-2">+${p1.pts} pts</span>`:''}
        </div>
        ${miniCard(podium[1],2)}
        ${miniCard(podium[2],3)}`;
    }
  }
  // Countdown to next GP
  if(countdownInterval){clearInterval(countdownInterval);countdownInterval=null;}
  const cdEl=document.getElementById('homeCountdown');
  if(cdEl){
    const nextIdx=racesDone;
    if(nextIdx<cal.length){
      const nr=cal[nextIdx];
      const months={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
      const dp=nr.date.split(' ');
      const utcH=20; // 20:00 UTC = 17:00 ART (UTC-3)
      const raceDate=new Date(Date.UTC(parseInt(currentYear),months[dp[dp.length-1]],parseInt(dp[0]),utcH,0,0));
      const artH=String(utcH-3).padStart(2,'0'); // 17:00 ARG
      const circuit=CAL_DATA.circuits[nr.id]||{};
      const fl=FLAGS&&FLAGS[nr.id];
      const fHtml=fl?`<span class="fi fi-${fl} fi-4x3" style="display:inline-block;width:20px;height:14px;border-radius:1px;vertical-align:middle"></span>`:'';
      cdEl.innerHTML=`
        <div class="bg-surface-container-low p-4">
          <div class="flex items-center justify-between mb-3">
            <span class="text-[9px] font-headline font-bold uppercase tracking-[0.2em] text-zinc-500">Próxima carrera</span>
            <span class="text-xs font-headline font-bold text-zinc-300">~${artH}:00 <span class="text-zinc-500">ARG</span></span>
          </div>
          <div class="flex items-center gap-2 mb-4">
            ${fHtml}
            <span class="text-sm font-headline font-black uppercase tracking-tight">${circuit.name||nr.id}</span>
            <span class="text-[10px] font-headline text-zinc-500 ml-auto shrink-0">R${nr.round} · ${nr.date}</span>
          </div>
          <div class="grid grid-cols-4 gap-2">
            <div class="text-center"><p class="text-2xl font-headline font-black text-primary leading-none" id="cdDays">--</p><p class="text-[8px] font-headline uppercase tracking-widest text-zinc-500 mt-1">días</p></div>
            <div class="text-center"><p class="text-2xl font-headline font-black text-primary leading-none" id="cdHours">--</p><p class="text-[8px] font-headline uppercase tracking-widest text-zinc-500 mt-1">horas</p></div>
            <div class="text-center"><p class="text-2xl font-headline font-black text-primary leading-none" id="cdMins">--</p><p class="text-[8px] font-headline uppercase tracking-widest text-zinc-500 mt-1">min</p></div>
            <div class="text-center"><p class="text-2xl font-headline font-black text-primary leading-none" id="cdSecs">--</p><p class="text-[8px] font-headline uppercase tracking-widest text-zinc-500 mt-1">seg</p></div>
          </div>
        </div>`;
      function tick(){
        const diff=raceDate.getTime()-Date.now();
        const el=document.getElementById('cdDays');if(!el)return;
        if(diff<=0){['cdDays','cdHours','cdMins','cdSecs'].forEach(id=>{const e=document.getElementById(id);if(e)e.textContent='0';});clearInterval(countdownInterval);return;}
        document.getElementById('cdDays').textContent=Math.floor(diff/86400000);
        document.getElementById('cdHours').textContent=String(Math.floor((diff%86400000)/3600000)).padStart(2,'0');
        document.getElementById('cdMins').textContent=String(Math.floor((diff%3600000)/60000)).padStart(2,'0');
        document.getElementById('cdSecs').textContent=String(Math.floor((diff%60000)/1000)).padStart(2,'0');
      }
      tick();countdownInterval=setInterval(tick,1000);
    }else{cdEl.innerHTML='';}
  }
  // Winner strip
  const strip=document.getElementById('homeWinnerStrip');
  const stripScroll=document.getElementById('stripScroll');
  const stripFadeR=document.getElementById('stripFadeR');
  const stripFadeL=document.getElementById('stripFadeL');
  function updateStripFade(){
    if(!stripScroll)return;
    const atEnd=stripScroll.scrollLeft+stripScroll.clientWidth>=stripScroll.scrollWidth-4;
    const atStart=stripScroll.scrollLeft<=4;
    if(stripFadeR)stripFadeR.style.opacity=atEnd?'0':'1';
    if(stripFadeL)stripFadeL.style.opacity=atStart?'0':'1';
  }
  if(stripScroll){
    stripScroll.removeEventListener('scroll',stripScroll._fadeHandler);
    stripScroll._fadeHandler=updateStripFade;
    stripScroll.addEventListener('scroll',updateStripFade,{passive:true});
    // Drag to scroll
    if(!stripScroll._dragInit){
      stripScroll._dragInit=true;
      let dragging=false,startX=0,scrollStart=0,moved=false;
      stripScroll.style.cursor='grab';
      stripScroll.addEventListener('mousedown',e=>{dragging=true;moved=false;startX=e.pageX;scrollStart=stripScroll.scrollLeft;stripScroll.style.cursor='grabbing';stripScroll.style.userSelect='none';});
      window.addEventListener('mousemove',e=>{if(!dragging)return;const dx=e.pageX-startX;if(Math.abs(dx)>4)moved=true;stripScroll.scrollLeft=scrollStart-dx;});
      window.addEventListener('mouseup',()=>{if(!dragging)return;dragging=false;stripScroll.style.cursor='grab';stripScroll.style.userSelect='';});
      stripScroll.addEventListener('click',e=>{if(moved){e.stopPropagation();e.preventDefault();}},true);
    }
  }
  if(strip){strip.innerHTML=cal.map((r,i)=>{
    let winnerId='',winnerColor='',winnerLabel='···';
    for(const d of s.drivers){
      if((pos[d.id]||[])[i]==='1'){
        winnerId=d.id;
        const rcId=RACE_CONSTRUCTORS&&RACE_CONSTRUCTORS[currentYear]&&RACE_CONSTRUCTORS[currentYear][d.id]?RACE_CONSTRUCTORS[currentYear][d.id][i]:null;
        const tObj=rcId?s.constructors.find(c=>c.id===rcId):null;
        winnerColor=tObj?tObj.color:d.color;
        winnerLabel=d.id;
        break;
      }
    }
    const ran=i<racesDone;
    const fl=FLAGS&&FLAGS[r.id];
    const flagHtml=fl?`<span class="fi fi-${fl} fi-4x3" style="display:inline-block;width:22px;height:15px;border-radius:1px;opacity:${winnerId?1:0.4}"></span>`:`<span style="width:22px;height:15px;display:inline-block"></span>`;
    const borderColor=winnerId?winnerColor:(ran?'#52525b':'#3f3f46');
    const bg=winnerId?winnerColor+'22':'transparent';
    const labelColor=winnerId?winnerColor:(ran?'#71717a':'#3f3f46');
    return `<button onclick="openGP(${i})" class="flex flex-col items-center gap-1 pt-2 pb-2 px-1.5 min-w-[46px] transition-opacity hover:opacity-80" style="background:${bg};border-top:2px solid ${borderColor}" title="R${r.round} ${r.id}${winnerId?' · '+winnerId:''}">
      <span class="text-[8px] font-headline text-zinc-600 font-bold leading-none">${r.round}</span>
      ${flagHtml}
      <span class="text-[9px] font-headline font-black uppercase leading-none" style="color:${labelColor}">${ran?winnerLabel:'···'}</span>
    </button>`;
  }).join('');setTimeout(updateStripFade,0);}
  // Driver wins chart
  const dEntries=Object.entries(dWins).sort((a,b)=>b[1]-a[1]);
  const dLabels=dEntries.map(([id])=>{const d=s.drivers.find(x=>x.id===id);return d?d.name:id;});
  const dData=dEntries.map(([,w])=>w);
  const dColorsArr=dEntries.map(([id])=>{const d=s.drivers.find(x=>x.id===id);return d?d.color:'#888';});
  homeChartDriver=renderDonut('homeChartDriver',dLabels,dData,dColorsArr,'homeDriverLegend',homeChartDriver);
  // Team wins chart
  const tEntries=Object.entries(tWins).sort((a,b)=>b[1]-a[1]);
  const tLabels=tEntries.map(([n])=>n);
  const tData=tEntries.map(([,w])=>w);
  const tColorsArr=tEntries.map(([n])=>tColors[n]||'#888');
  homeChartTeam=renderDonut('homeChartTeam',tLabels,tData,tColorsArr,'homeTeamLegend',homeChartTeam);
}

// Poblar selector de años dinámicamente desde SEASONS
(function(){
  const sel=document.getElementById('yearSelect');
  Object.keys(SEASONS).sort((a,b)=>+b-+a).forEach(y=>{
    const opt=document.createElement('option');
    opt.value=y;opt.textContent=y;
    if(y===currentYear)opt.selected=true;
    sel.appendChild(opt);
  });
})();
buildCompare();buildChart('drivers');buildStandings('drivers');updateSeasonStatus();showPage('home');

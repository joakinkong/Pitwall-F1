// ============================================================
// APP — Logica principal: navegacion, charts, UI, detalles
// Cambia cuando agregas una feature o arreglas un bug de UI.
// ============================================================

let currentYear='2026',currentTab='drivers',chart=null,miniChart=null,currentPage='home',navStack=[],homeChartDriver=null,homeChartTeam=null,countdownInterval=null,homeChartData=null;

// Mapeo: ID interno único → código de display oficial F1
// Solo se necesita cuando el código visual difiere del ID interno.
const DRIVER_DISPLAY_CODES={
  "JOS":"VER","JVR":"VER",          // Jos Verstappen / Jean-Éric Vergne
  "ALR":"ALB","CAL":"ALB",          // Alboreto / Albers
  "EBN":"BER",                       // Éric Bernard
  "JBL":"BOU","SBD":"BOU",          // Boullion / Bourdais
  "DBM":"BRA",                       // David Brabham
  "PCH":"CHA",                       // Pedro Chaves
  "ACH":"CHI",                       // Andrea Chiesa
  "PFT":"FIT",                       // Pietro Fittipaldi
  "GMZ":"GAS",                       // Gastón Mazzacane
  "GBR":"GIA",                       // Gianmaria Bruni
  "GPA":"GIO",                       // Giorgio Pantano
  "OGR":"GRO",                       // Olivier Grouillard
  "RHA":"HAR",                       // Rio Haryanto
  "JLA":"LAM",                       // Jan Lammers
  "JMG":"MAG",                       // Jan Magnussen
  "TMQ":"MAR",                       // Tarso Marques
  "AMO":"MON",                       // Andrea Montermini
  "GMO":"MOR",                       // Giovanni Morbidelli
  "SNJ":"NAK","SNA":"NAK",          // S. Nakajima / S. Nakano
  "ENS":"NAS",                       // Emanuele Naspetti
  "PJR":"PIQ",                       // Nelson Piquet Jr.
  "RRS":"ROS",                       // Ricardo Rosset
  "BSN":"SCH","DSC":"SCH",          // Schneider / Schiattarella
  "RDB":"DOO",                       // Robert Doornbos
  "SSZ":"SAR",                       // Sébastien Sarrazin
  "PBR":"BAR","FBZ":"BAR",          // Barilla / Barbazza
  "MCN":"ALL",                       // Allan McNish
  "YOO":"ALE",                       // Alex Yoong
};
function dCode(id){return DRIVER_DISPLAY_CODES[id]||id;}

// Códigos de no-clasificación en position_text (posición no numérica).
// Debe mantenerse espejada con NON_FINISH_CODES en backend/constants.py.
const NON_FINISH_CODES=['R','DSQ','DNS','W','D','EX','E','F','N'];
function nonFinishPriority(code){const i=NON_FINISH_CODES.indexOf(code);return i===-1?99:i;}

function showPage(p,pushHistory){
if(pushHistory!==false&&currentPage&&currentPage!==p)navStack.push(currentPage);
currentPage=p;
['pageHome','pageStandings','pageCalendar','pageGPDetail','pageDriverDetail','pageTeamDetail','pageResultsGrid','pageRecords','pageSimulator','pagePerformance'].forEach(id=>{document.getElementById(id).style.display='none';});
const pm={home:'pageHome',standings:'pageStandings',calendar:'pageCalendar',gpdetail:'pageGPDetail',driver:'pageDriverDetail',team:'pageTeamDetail',grid:'pageResultsGrid',records:'pageRecords',sim:'pageSimulator',perf:'pagePerformance'};
document.getElementById(pm[p]||'pageHome').style.display='block';
document.getElementById('bottomNav').style.display='flex';
const isDetail=['gpdetail','driver','team','grid','sim','perf'].includes(p);
document.getElementById('backBtn').style.display=isDetail?'flex':'none';
document.getElementById('headerLeft').style.display=isDetail?'none':'flex';
document.getElementById('headerRight').style.display=(isDetail||p==='records')?'none':'flex';
const nh=document.getElementById('navHome'),ns=document.getElementById('navStandings'),nc=document.getElementById('navCalendar'),nr=document.getElementById('navRecords');
[nh,ns,nc,nr].forEach(b=>{b.className=b.className.replace('text-[#ffb4a7]','text-zinc-500').replace('border-[#ffb4a7]','border-transparent');b.querySelector('.material-symbols-outlined').style.fontVariationSettings="'FILL' 0";});
let active=null;
if(p==='home')active=nh;
else if(p==='standings'||p==='driver'||p==='team'||p==='grid'||p==='sim'||p==='perf')active=ns;
else if(p==='calendar'||p==='gpdetail')active=nc;
else if(p==='records')active=nr;
if(active){active.className=active.className.replace('text-zinc-500','text-[#ffb4a7]').replace('border-transparent','border-[#ffb4a7]');active.querySelector('.material-symbols-outlined').style.fontVariationSettings="'FILL' 1";}
if(p==='home')buildHome();if(p==='calendar')buildCalendar();if(p==='standings'){buildChart(currentTab);buildStandings(currentTab);updateSeasonStatus();updatePerformanceButtonVisibility();}if(p==='records')buildRecords();if(p==='sim')buildSimulator();if(p==='perf')buildPerformance();window.scrollTo(0,0);}

function goBack(){
if(navStack.length>0){
  const prev=navStack.pop();
  showPage(prev,false);
}else{
  showPage('standings',false);
}
}

async function changeYear(y){if(window.loadYearData)await window.loadYearData(y);currentYear=y;document.getElementById('seasonTitle').textContent='SEASON '+y;const s=SEASONS[y];document.getElementById('raceCount').textContent=(s.completed?s.completed+'/'+s.races.length:s.races.length)+' Carreras';buildCompare();buildChart(currentTab);buildStandings(currentTab);if(currentPage==='home')buildHome();if(currentPage==='calendar')buildCalendar();if(currentPage==='sim')buildSimulator();updateSeasonStatus();updatePerformanceButtonVisibility();}

function buildChart(tab){const ctx=document.getElementById('mainChart').getContext('2d');if(chart)chart.destroy();const s=SEASONS[currentYear];let source=tab==='drivers'?s.drivers:s.constructors;
const idA=document.getElementById('selectA')?.value,idB=document.getElementById('selectB')?.value;
if(idA&&idB)source=source.filter(d=>d.id===idA||d.id===idB);
let sec=new Set();if(tab==='drivers'){const tb={};for(const d of source){if(!tb[d.color]||d.total>tb[d.color].total)tb[d.color]=d;}for(const d of source){if(tb[d.color]&&tb[d.color].id!==d.id)sec.add(d.id);}}
const racesDone=s.completed||s.races.length;const chartLabels=s.races.slice(0,racesDone);const ds=source.map(d=>({label:dCode(d.id),data:d.cum.slice(0,racesDone),borderColor:d.color,backgroundColor:d.color+'18',borderWidth:2.2,borderDash:sec.has(d.id)?[6,3]:[],pointRadius:3,pointHoverRadius:6,pointBackgroundColor:d.color,pointBorderColor:'#121314',pointBorderWidth:1.5,tension:.3,fill:false}));
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
const le=document.getElementById('chartLegend');le.innerHTML=source.map((d,i)=>{const isDash=sec.has(d.id);const st=isDash?'background:transparent;border:2px dashed '+d.color:'background:'+d.color;return '<button onclick="toggleDs('+i+')" class="flex items-center gap-1.5 cursor-pointer transition-opacity" id="lb'+i+'"><span class="legend-dot" style="'+st+'"></span><span class="text-[9px] uppercase font-bold text-zinc-400 hover:text-white transition-colors font-headline tracking-wider">'+dCode(d.id)+'</span></button>';}).join('');
document.getElementById('chartSubtitle').textContent=s.races.length+' GP — '+(tab==='drivers'?'Pilotos':'Constructores');}
function toggleDs(i){const m=chart.getDatasetMeta(i);m.hidden=!m.hidden;chart.update();document.getElementById('lb'+i).style.opacity=m.hidden?'.25':'1';}
// Orden de clasificación: puntos desc, con desempate oficial por cantidad de
// mejores resultados (más 1ros, luego más 2dos, ...). `entries` necesita
// {id,total}; se compara contra las posiciones reales de carrera de ese año
// (el desempate es por resultados, no por puntos simulados).
function orderByPointsWithTiebreak(year,entries){
  const posData=POSITIONS[year]||{};
  return [...entries].sort((a,b)=>{
    if(b.total!==a.total)return b.total-a.total;
    const pa=posData[a.id]||[],pb=posData[b.id]||[];
    for(let pos=1;pos<=20;pos++){
      const ca=pa.filter(r=>r===String(pos)).length,cb=pb.filter(r=>r===String(pos)).length;
      if(cb!==ca)return cb-ca;
    }
    return 0;
  });
}

function standingsOrder(tab){const s=SEASONS[currentYear];return orderByPointsWithTiebreak(currentYear,tab==='drivers'?s.drivers:s.constructors);}

function buildStandings(tab){const s=SEASONS[currentYear],ch=tab==='drivers'?s.champion_driver:s.champion_constructor;const c=document.getElementById('standingsCards');document.getElementById('standingsTitle').textContent='Clasificación — '+(tab==='drivers'?'Pilotos':'Constructores');
const source=standingsOrder(tab);
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

// RESULTS GRID — tabla estilo web oficial de F1 (pilotos × carreras, celda coloreada por resultado)

// Corte de puntos por era. Ajustar acá si cambia el reglamento.
const POINTS_CUTOFF_ERAS=[
  {from:1950,to:1959,cutoff:5},
  {from:1960,to:2002,cutoff:6},
  {from:2003,to:2009,cutoff:8},
  {from:2010,to:9999,cutoff:10},
];
function pointsCutoffForYear(year){const y=parseInt(year);const era=POINTS_CUTOFF_ERAS.find(e=>y>=e.from&&y<=e.to);return era?era.cutoff:10;}

// Color/label de celda para un resultado. Robusto por construcción: cualquier
// código no reconocido cae en el bucket gris "sin puntos" en vez de romper.
function resultsGridCell(pos,cutoff){
  if(pos===''||pos===undefined)return{bg:'#1b1c1d',fg:'#3f3f46',label:'–'};
  if(NON_FINISH_CODES.includes(pos))return{bg:'#df1300',fg:'#ffffff',label:pos};
  const n=parseInt(pos);
  if(isNaN(n))return{bg:'#3f3f46',fg:'#a1a1aa',label:pos};
  if(n===1)return{bg:'#FFD700',fg:'#121314',label:pos};
  if(n===2)return{bg:'#C0C0C0',fg:'#121314',label:pos};
  if(n===3)return{bg:'#CD7F32',fg:'#121314',label:pos};
  if(n<=cutoff)return{bg:'#1b7a3d',fg:'#e3e2e3',label:pos};
  return{bg:'#3f3f46',fg:'#a1a1aa',label:pos};
}

function gridLegendItem(color,label){return `<div class="flex items-center gap-1.5"><span class="w-3 h-3 inline-block flex-shrink-0" style="background:${color}"></span><span class="text-[9px] font-headline uppercase tracking-wide text-zinc-400">${label}</span></div>`;}

function openResultsGrid(){
  const s=SEASONS[currentYear];if(!s)return;
  const cal=CAL_DATA.calendars[currentYear]||[];
  const pos=POSITIONS[currentYear]||{};
  const cutoff=pointsCutoffForYear(currentYear);
  const drivers=standingsOrder('drivers');

  const headCells=cal.map((r,i)=>{
    const spDot=r.sprint?'<span class="w-1 h-1 rounded-full bg-secondary inline-block ml-1"></span>':'';
    return `<th class="px-1 py-2 text-center align-bottom cursor-pointer" onclick="openGP(${i})"><span class="text-[9px] font-headline font-bold uppercase tracking-widest text-zinc-500 hover:text-primary transition-colors">${r.id}${spDot}</span></th>`;
  }).join('');

  const bodyRows=drivers.map((d,i)=>{
    const posArr=pos[d.id]||[];
    const cells=cal.map((r,ci)=>{
      const cell=resultsGridCell(posArr[ci]||'',cutoff);
      return `<td class="text-center px-1 py-1"><div class="w-8 h-8 flex items-center justify-center text-[11px] font-headline font-black tabular-nums mx-auto" style="background:${cell.bg};color:${cell.fg}">${cell.label}</div></td>`;
    }).join('');
    return `<tr>
      <td class="sticky left-0 z-10 bg-surface-container-lowest px-2 py-1 whitespace-nowrap border-r border-white/5">
        <div class="flex items-center gap-2">
          <span class="text-[10px] font-headline font-black tabular-nums text-zinc-600 w-5 text-right flex-shrink-0">${i+1}</span>
          <div class="w-1 h-5 flex-shrink-0" style="background:${d.color}"></div>
          <span class="text-xs font-headline font-bold uppercase cursor-pointer hover:text-primary transition-colors" onclick="openDriverDetail('${d.id}')">${dCode(d.id)}</span>
        </div>
      </td>
      ${cells}
    </tr>`;
  }).join('');

  document.getElementById('resultsGridContent').innerHTML=`
    <div class="flex items-end justify-between mb-4">
      <div><span class="text-secondary text-[10px] font-bold uppercase tracking-[0.2em] font-headline mb-1 block">Grilla de Resultados</span><h2 class="text-2xl font-headline font-bold leading-none tracking-tighter">SEASON ${currentYear}</h2></div>
    </div>
    <div class="overflow-x-auto -mx-6 px-6 pb-2">
      <table class="border-separate" style="border-spacing:2px 2px">
        <thead><tr>
          <th class="sticky left-0 z-10 bg-surface-container-lowest text-left px-2 py-2 border-r border-white/5"><span class="text-[9px] font-headline font-bold uppercase tracking-widest text-zinc-500">Piloto</span></th>
          ${headCells}
        </tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
    <div class="flex flex-wrap gap-x-4 gap-y-2 mt-4 pt-4 border-t border-white/5">
      ${gridLegendItem('#FFD700','1º')}
      ${gridLegendItem('#C0C0C0','2º')}
      ${gridLegendItem('#CD7F32','3º')}
      ${gridLegendItem('#1b7a3d','Puntos (top '+cutoff+')')}
      ${gridLegendItem('#3f3f46','Sin puntos')}
      ${gridLegendItem('#df1300','No clasificó')}
    </div>`;
  showPage('grid');
}

// RECORDS — página de récords históricos, precalculados en docs/data/records.json
// por export_static.py (el frontend solo filtra por era y renderiza).

let recordsData=null;
let currentRecordsEra='all';

async function loadRecordsData(){
  if(recordsData)return recordsData;
  const r=await fetch('data/records.json');
  if(!r.ok)throw new Error('404: data/records.json');
  recordsData=await r.json();
  return recordsData;
}

// Preview de récords en Home (siempre era "all" — todos los tiempos, no
// depende de currentYear). Reusa recordsData/recordsLeaderboard tal cual
// los usa la página Récords completa; "Ver todos →" navega a esa página.
async function buildHomeRecords(){
  const el=document.getElementById('homeRecords');
  if(!el)return;
  let data;
  try{ data=await loadRecordsData(); }
  catch(err){ el.innerHTML=''; return; }
  const rec=data.records['all'];
  if(!rec)return;
  const topDrivers=(rec.most_wins_drivers||[]).slice(0,5);
  const topTeams=(rec.most_wins_teams||[]).slice(0,5);
  el.innerHTML=
    recordsLeaderboard('Más victorias — Pilotos',topDrivers,'wins','openDriverDetail')+
    recordsLeaderboard('Más victorias — Equipos',topTeams,'wins','openTeamDetail');
}

async function buildRecords(){
  const el=document.getElementById('recordsContent');
  if(!recordsData)el.innerHTML='<p class="text-xs text-zinc-500 italic text-center py-8">Cargando récords…</p>';
  let data;
  try{ data=await loadRecordsData(); }
  catch(err){ el.innerHTML='<p class="text-xs text-red-400 italic text-center py-8">No se pudieron cargar los récords.<br>Corré <code class="text-secondary">python export_static.py</code>.</p>'; return; }
  if(!data.eras.find(e=>e.id===currentRecordsEra))currentRecordsEra='all';
  renderRecords();
}

function changeRecordsEra(eraId){
  currentRecordsEra=eraId;
  renderRecords();
}

function recordsLeaderboard(title,items,unitKey,onclickFn){
  if(!items||items.length===0){
    return `<div class="mb-4"><h3 class="text-[10px] font-headline font-bold uppercase tracking-[0.3em] text-zinc-500 mb-3">${title}</h3><p class="text-xs text-zinc-500 italic text-center py-4">Sin datos en esta era</p></div>`;
  }
  const rows=items.map((it,i)=>{
    const rankColor=i===0?'text-[#FFD700]':i===1?'text-[#C0C0C0]':i===2?'text-[#CD7F32]':'text-zinc-600';
    return `<div class="flex items-center justify-between py-2 px-3 border-b border-white/5 last:border-0 cursor-pointer hover:bg-surface-container-high transition-colors" onclick="${onclickFn}('${it.id}')">
      <div class="flex items-center gap-3"><span class="text-xs font-headline font-black tabular-nums ${rankColor} w-5 text-center">${i+1}</span><span class="text-xs font-headline font-bold uppercase">${it.name}</span></div>
      <span class="text-sm font-headline font-bold tabular-nums text-primary">${it[unitKey]}</span>
    </div>`;
  }).join('');
  return `<div class="mb-4"><h3 class="text-[10px] font-headline font-bold uppercase tracking-[0.3em] text-zinc-500 mb-3">${title}</h3><div class="bg-surface-container-low border border-white/5">${rows}</div></div>`;
}

function recordsStatCard(label,value,sub){
  return `<div class="bg-surface-container-low border border-white/5 p-4 mb-4"><span class="text-[9px] text-zinc-600 uppercase tracking-widest block font-headline mb-1">${label}</span><span class="text-2xl stat-num text-primary">${value}</span>${sub?`<p class="text-[10px] text-zinc-500 mt-1.5 leading-relaxed">${sub}</p>`:''}</div>`;
}

function renderRecords(){
  const data=recordsData;
  const era=data.eras.find(e=>e.id===currentRecordsEra)||data.eras[0];
  const rec=data.records[era.id];
  const eraOptions=data.eras.map(e=>`<option value="${e.id}" ${e.id===era.id?'selected':''}>${e.label}</option>`).join('');

  const streak=rec.win_streak;
  const streakSub=streak?`<span class="clickable-name" onclick="openDriverDetail('${streak.driver_id}')">${streak.driver_name}</span> · ${streak.from_year} R${streak.from_round} → ${streak.to_year} R${streak.to_round}`:'Sin datos en esta era';
  const streakCard=recordsStatCard('Racha de victorias consecutivas',streak?streak.streak+' victorias':'—',streakSub);

  const margin=rec.title_margin;
  const marginSub=margin?`<span class="clickable-name" onclick="openDriverDetail('${margin.champion_id}')">${margin.champion_name}</span> (${margin.champion_points}) vs <span class="clickable-name" onclick="openDriverDetail('${margin.runnerup_id}')">${margin.runnerup_name}</span> (${margin.runnerup_points}) · ${margin.year}`:'Sin títulos decididos en esta era';
  const marginCard=recordsStatCard('Mayor diferencia de puntos (título)',margin?'+'+margin.margin+' pts':'—',marginSub);

  document.getElementById('recordsContent').innerHTML=`
    <div class="mb-4"><span class="text-secondary text-[10px] font-bold uppercase tracking-[0.2em] font-headline mb-1 block">Historia · 1950-2026</span><h2 class="text-3xl font-headline font-bold leading-none tracking-tighter">RÉCORDS</h2></div>
    <select id="eraSelect" onchange="changeRecordsEra(this.value)" class="year-select bg-surface-container-high border border-outline-variant/40 text-primary font-headline font-bold text-xs px-3 py-2 cursor-pointer focus:outline-none focus:border-primary w-full mb-6">${eraOptions}</select>
    ${streakCard}
    ${marginCard}
    ${recordsLeaderboard('Más victorias — Pilotos',rec.most_wins_drivers,'wins','openDriverDetail')}
    ${recordsLeaderboard('Más victorias — Equipos',rec.most_wins_teams,'wins','openTeamDetail')}
    ${recordsLeaderboard('Más podios — Pilotos',rec.most_podiums_drivers,'podiums','openDriverDetail')}
    ${recordsLeaderboard('Más podios — Equipos',rec.most_podiums_teams,'podiums','openTeamDetail')}
    <p class="text-[9px] text-zinc-600 uppercase tracking-widest text-center leading-relaxed mt-2 mb-4">Campeón más joven / más viejo: pendiente — falta fecha de nacimiento para algunos campeones en la DB.</p>`;
}

// SIMULADOR "¿Y SI...?" — recalcula la tabla de pilotos de una temporada con
// otro sistema de puntos, usando docs/data/points_systems.json (precalculado,
// ver CLAUDE.md § Changelog para el diseño completo del dataset).

let pointsSystemsData=null;
let simSystemId='modern_25';

async function loadPointsSystemsData(){
  if(pointsSystemsData)return pointsSystemsData;
  const r=await fetch('data/points_systems.json');
  if(!r.ok)throw new Error('404: data/points_systems.json');
  pointsSystemsData=await r.json();
  return pointsSystemsData;
}

// Puntos por posición según un array [pts_p1, pts_p2, ...]. Cualquier valor
// no numérico (códigos de NON_FINISH_CODES, o "" si la carrera no se corrió)
// da NaN en parseInt y puntúa 0 — robusto por construcción, no hace falta
// chequear la lista de códigos explícitamente.
function simRacePoints(pos,pointsArr){
  const n=parseInt(pos);
  if(isNaN(n)||n<1||n>pointsArr.length)return 0;
  return pointsArr[n-1];
}

// El catálogo `systems` no trae su propia regla de descartes (eso vive por
// año en `years`). Usamos el descarte del ÚLTIMO año real que usó ese
// sistema como "regla representativa" — para classic_9 eso da 1990
// (mejores 11 de N), evitando el caso especial de 1980 (temporada partida).
function referenceDroppedScores(systemId){
  const years=pointsSystemsData.years;
  const matching=Object.keys(years).filter(y=>years[y].system===systemId).sort();
  if(matching.length===0)return null;
  return years[matching[matching.length-1]].dropped_scores;
}

// Aplica una regla de descarte (best_n o split, ver points_systems.json) a
// un array de puntos por ronda en orden de calendario. Espejo exacto de
// _apply_dropped_scores en backend/crud.py (que usa el mismo dataset para
// corregir el total "real" que muestra la app, no solo el simulador).
function applyDroppedScores(perRound,dropped){
  if(!dropped)return perRound.reduce((a,b)=>a+b,0);
  if(dropped.mode==='best_n')return [...perRound].sort((a,b)=>b-a).slice(0,dropped.keep).reduce((a,b)=>a+b,0);
  if(dropped.mode==='split'){
    let total=0,idx=0;
    for(const half of dropped.halves){
      const seg=perRound.slice(idx,idx+half.races);
      total+=[...seg].sort((a,b)=>b-a).slice(0,half.keep).reduce((a,b)=>a+b,0);
      idx+=half.races;
    }
    return total;
  }
  return perRound.reduce((a,b)=>a+b,0);
}

// Recalcula el total de cada piloto de `year` aplicando `systemId` a las
// posiciones reales de carrera (POSITIONS[year]) más el sprint REAL de esa
// temporada (SPRINTS[year], con el sistema de sprint que rigió ese año —
// esto no es elegible por el usuario, es un hecho de la temporada elegida).
function computeSimTotals(year,systemId){
  const sys=pointsSystemsData.systems[systemId];
  const pointsArr=sys.points;
  const posData=POSITIONS[year]||{};
  const sprintData=SPRINTS[year]||{};
  const yearMeta=pointsSystemsData.years[String(year)];
  const sprintSystemId=yearMeta?yearMeta.sprint:null;
  const sprintPointsArr=sprintSystemId?pointsSystemsData.sprint_systems[sprintSystemId].points:null;
  const dropped=referenceDroppedScores(systemId);
  const s=SEASONS[year];
  const numRounds=(s.races||[]).length;

  return s.drivers.map(d=>{
    const posArr=posData[d.id]||[];
    const perRound=[];
    for(let i=0;i<numRounds;i++){
      let pts=simRacePoints(posArr[i]||'',pointsArr);
      const spRound=sprintData[String(i)];
      if(sprintPointsArr&&spRound&&spRound[d.id]!==undefined){
        pts+=simRacePoints(spRound[d.id],sprintPointsArr);
      }
      perRound.push(pts);
    }
    const total=applyDroppedScores(perRound,dropped);
    return {id:d.id,name:d.name,team:d.team,color:d.color,total};
  });
}

async function openSimulator(){
  try{ await loadPointsSystemsData(); }catch(err){ /* buildSimulator maneja el error al renderizar */ }
  if(window.loadYearData)await window.loadYearData(currentYear);
  showPage('sim');
}

async function buildSimulator(){
  const el=document.getElementById('simulatorContent');
  if(!pointsSystemsData){
    el.innerHTML='<p class="text-xs text-zinc-500 italic text-center py-8">Cargando…</p>';
    try{ await loadPointsSystemsData(); }
    catch(err){ el.innerHTML='<p class="text-xs text-red-400 italic text-center py-8">No se pudieron cargar los sistemas de puntos.<br>Corré <code class="text-secondary">python export_static.py</code>.</p>'; return; }
  }
  if(!SEASONS[currentYear]||!SEASONS[currentYear].drivers||SEASONS[currentYear].drivers.length===0){
    el.innerHTML='<p class="text-xs text-zinc-500 italic text-center py-8">Cargando temporada…</p>';
    if(window.loadYearData)await window.loadYearData(currentYear);
  }
  renderSimulator();
}

function changeSimSystem(systemId){
  simSystemId=systemId;
  renderSimulator();
}

function renderSimulator(){
  const year=currentYear;
  const s=SEASONS[year];
  const el=document.getElementById('simulatorContent');
  if(!s||!s.drivers||s.drivers.length===0){
    el.innerHTML='<p class="text-xs text-zinc-500 italic text-center py-8">Sin datos para '+year+'.</p>';
    return;
  }

  const systemOptions=Object.keys(pointsSystemsData.systems).map(id=>`<option value="${id}" ${id===simSystemId?'selected':''}>${pointsSystemsData.systems[id].label}</option>`).join('');

  const realOrder=orderByPointsWithTiebreak(year,s.drivers);
  const simTotalsRaw=computeSimTotals(year,simSystemId);
  const simOrder=orderByPointsWithTiebreak(year,simTotalsRaw);

  const realPosById={};realOrder.forEach((d,i)=>realPosById[d.id]=i+1);

  const realDone=!!s.champion_driver;
  const realChampId=realDone?s.champion_driver:realOrder[0].id;
  const simChampId=simOrder[0].id;
  const champChanged=realChampId!==simChampId;
  const realChampEntry=s.drivers.find(d=>d.id===realChampId);
  const simChampEntry=simOrder[0];

  const champBanner=champChanged?`
    <div class="bg-primary-container/20 border border-primary-container/40 p-4 mb-4">
      <div class="flex items-center gap-2 mb-2"><span class="material-symbols-outlined text-primary">bolt</span><span class="text-xs font-headline font-black uppercase tracking-widest text-primary">¡Cambia el campeón!</span></div>
      <p class="text-xs text-zinc-300 leading-relaxed"><span class="clickable-name" onclick="openDriverDetail('${simChampId}')">${simChampEntry.name}</span> sería campeón con este sistema (${simChampEntry.total} pts), en vez de <span class="clickable-name" onclick="openDriverDetail('${realChampId}')">${realChampEntry?realChampEntry.name:realChampId}</span>${realDone?'':' (líder actual)'}.</p>
    </div>`:`
    <div class="bg-surface-container-low border border-white/5 p-4 mb-4">
      <div class="flex items-center gap-2"><span class="material-symbols-outlined text-secondary">check_circle</span><span class="text-xs font-headline font-bold uppercase tracking-widest text-secondary">El campeón no cambia</span></div>
      <p class="text-xs text-zinc-400 mt-1"><span class="clickable-name" onclick="openDriverDetail('${simChampId}')">${simChampEntry.name}</span> sigue siendo ${realDone?'campeón':'líder'} con este sistema.</p>
    </div>`;

  const rows=simOrder.map((d,i)=>{
    const simPos=i+1;
    const realPos=realPosById[d.id]||simPos;
    const delta=realPos-simPos;
    let deltaHtml='<span class="text-[10px] font-headline font-bold text-zinc-600">— sin cambio</span>';
    if(delta>0)deltaHtml=`<span class="text-[10px] font-headline font-bold text-secondary">▲ ${delta} (era P${realPos})</span>`;
    else if(delta<0)deltaHtml=`<span class="text-[10px] font-headline font-bold text-red-400">▼ ${-delta} (era P${realPos})</span>`;
    const rankColor=simPos===1?'text-[#FFD700]':simPos===2?'text-[#C0C0C0]':simPos===3?'text-[#CD7F32]':'text-zinc-600';
    const bg=simPos===1?'bg-surface-container-high':'';
    return `<div class="flex items-center justify-between py-2.5 px-3 ${bg} border-b border-white/5 last:border-0 cursor-pointer hover:bg-surface-container-high transition-colors" onclick="openDriverDetail('${d.id}')">
      <div class="flex items-center gap-3 min-w-0">
        <span class="text-lg font-headline font-black italic tabular-nums ${rankColor} w-7 text-center flex-shrink-0">${simPos}</span>
        <div class="w-1 h-8 flex-shrink-0" style="background:${d.color}"></div>
        <div class="min-w-0"><span class="text-xs font-headline font-bold uppercase block truncate">${d.name}</span>${deltaHtml}</div>
      </div>
      <span class="text-sm font-headline font-bold tabular-nums text-primary flex-shrink-0 ml-2">${d.total}</span>
    </div>`;
  }).join('');

  const limitations=(pointsSystemsData.meta&&pointsSystemsData.meta.limitations||[]).map(l=>`<li class="mb-1.5">${l}</li>`).join('');

  el.innerHTML=`
    <div class="mb-4"><span class="text-secondary text-[10px] font-bold uppercase tracking-[0.2em] font-headline mb-1 block">Simulador · Temporada ${year}</span><h2 class="text-3xl font-headline font-bold leading-none tracking-tighter">¿Y SI...?</h2></div>
    <div class="mb-4">
      <select id="simSystemSelect" onchange="changeSimSystem(this.value)" class="year-select bg-surface-container-high border border-outline-variant/40 text-secondary font-headline font-bold text-xs px-3 py-2 cursor-pointer focus:outline-none focus:border-primary w-full">${systemOptions}</select>
    </div>
    ${champBanner}
    <div class="mb-2"><h3 class="text-[10px] font-headline font-bold uppercase tracking-[0.3em] text-zinc-500">Clasificación simulada — ${year} con ${pointsSystemsData.systems[simSystemId].label}</h3><p class="text-[9px] text-zinc-600 mt-1">Δ compara contra la clasificación real de ${year} (P${1} = ${realOrder[0].name}${realDone?' · campeón':' · líder'}).</p></div>
    <div class="bg-surface-container-low border border-white/5 mb-4">${rows}</div>
    <div class="mb-4"><h3 class="text-[10px] font-headline font-bold uppercase tracking-[0.3em] text-zinc-500 mb-2">Limitaciones conocidas</h3><ul class="text-[9px] text-zinc-600 leading-relaxed list-disc pl-4">${limitations}</ul></div>`;
}

// RENDIMIENTO — puestos ganados/perdidos (grilla vs. carrera) y quali vs.
// carrera. Solo existe para temporadas con datos extendidos (2025+, ver
// clave "extended" en seasons/{year}.json — CLAUDE.md § Esquema de datos).
// api.js no expone grid/quali/fastest_laps (solo carga season/positions/
// calendar/sprints/race_constructors), así que esta sección hace su propio
// fetch()+cache del JSON de temporada, igual que records.json/
// points_systems.json en las secciones de arriba — no toca api.js.

let extendedData={};              // year(string) -> {grid,quali,fastest_laps} | null
let perfSortKey='net',perfSortDir=-1,perfExpandedDriver=null;
let qualiSortKey='avg',qualiSortDir=-1;

async function loadExtendedData(year){
  const y=String(year);
  if(extendedData[y]!==undefined)return extendedData[y];
  try{
    const r=await fetch('data/seasons/'+y+'.json');
    if(!r.ok)throw new Error('404');
    const data=await r.json();
    extendedData[y]=(data.extended===true)?{grid:data.grid||{},quali:data.quali||{},fastest_laps:data.fastest_laps||{}}:null;
  }catch(err){
    extendedData[y]=null;
  }
  return extendedData[y];
}

async function updatePerformanceButtonVisibility(){
  const btn=document.getElementById('btnPerformance');
  if(!btn)return;
  const yearAtCall=currentYear;
  const ext=await loadExtendedData(yearAtCall);
  if(currentYear!==yearAtCall)return; // el usuario ya cambió de año mientras esperábamos
  btn.style.display=ext?'':'none';
}

function openPerformance(){
  showPage('perf');
}

async function buildPerformance(){
  const el=document.getElementById('performanceContent');
  if(extendedData[String(currentYear)]===undefined){
    el.innerHTML='<p class="text-xs text-zinc-500 italic text-center py-8">Cargando…</p>';
    await loadExtendedData(currentYear);
  }
  renderPerformance();
}

// Compara un array de "posición base" (grid o quali) contra la posición
// final, carrera por carrera. Los no clasificados (NON_FINISH_CODES) no
// computan delta — quedan aparte en `nonClassified` con delta:null. Solo
// cuenta rondas con dato base numérico Y ya corridas (posición final
// numérica o código de no-clasificación; "" = carrera futura, se ignora).
function computeDeltaStats(baseByDriver,positionsByDriver,driverIds,numRounds){
  const out={};
  for(const id of driverIds){
    const baseArr=baseByDriver[id]||[];
    const posArr=positionsByDriver[id]||[];
    const rounds=[];
    let gained=0,lost=0,nonClassified=0,racesWithData=0;
    for(let i=0;i<numRounds;i++){
      const baseNum=parseInt(baseArr[i]);
      if(isNaN(baseNum))continue;
      const finVal=posArr[i];
      if(NON_FINISH_CODES.includes(finVal)){
        nonClassified++;
        rounds.push({idx:i,base:baseNum,finish:finVal,delta:null});
        continue;
      }
      const finNum=parseInt(finVal);
      if(isNaN(finNum))continue; // "" u otro no numérico: carrera sin correr todavía
      racesWithData++;
      const delta=baseNum-finNum; // positivo = ganó posiciones
      if(delta>0)gained+=delta; else if(delta<0)lost+=-delta;
      rounds.push({idx:i,base:baseNum,finish:finNum,delta});
    }
    out[id]={racesWithData,gained,lost,net:gained-lost,nonClassified,rounds};
  }
  return out;
}

function countPoles(qualiByDriver,driverIds,numRounds){
  const poles={};
  for(const id of driverIds){
    const arr=qualiByDriver[id]||[];
    let c=0;
    for(let i=0;i<numRounds;i++){if(arr[i]==='1')c++;}
    if(c>0)poles[id]=c;
  }
  return poles;
}

function perfSortedDrivers(stats,driverMeta,sortKey,sortDir){
  return Object.keys(stats)
    .filter(id=>stats[id].racesWithData>0||stats[id].nonClassified>0)
    .map(id=>({id,...stats[id],name:driverMeta[id]?driverMeta[id].name:id,color:driverMeta[id]?driverMeta[id].color:'#888888'}))
    .sort((a,b)=>(a[sortKey]-b[sortKey])*sortDir);
}

function setPerfSort(key){
  if(perfSortKey===key)perfSortDir*=-1; else {perfSortKey=key;perfSortDir=-1;}
  renderPerformance();
}
function setQualiSort(key){
  if(qualiSortKey===key)qualiSortDir*=-1; else {qualiSortKey=key;qualiSortDir=-1;}
  renderPerformance();
}
function togglePerfExpand(id){
  perfExpandedDriver=(perfExpandedDriver===id)?null:id;
  renderPerformance();
}

function perfSortHeader(label,key,currentKey,currentDir,onclickFn){
  const active=key===currentKey;
  const arrow=active?(currentDir===-1?' ▼':' ▲'):'';
  const color=active?'text-primary':'text-zinc-500';
  return `<th class="px-2 py-2 text-right cursor-pointer select-none" onclick="${onclickFn}('${key}')"><span class="text-[9px] font-headline font-bold uppercase tracking-widest ${color}">${label}${arrow}</span></th>`;
}

function perfRaceDetailRow(d,colspan){
  const cal=CAL_DATA.calendars[currentYear]||[];
  const items=d.rounds.map(r=>{
    const gp=cal[r.idx]?cal[r.idx].id:('R'+(r.idx+1));
    if(r.delta===null){
      return `<div class="flex items-center justify-between py-1.5 px-3 border-b border-white/5 last:border-0"><span class="text-[10px] font-headline font-bold uppercase text-zinc-500">${gp}</span><span class="text-[10px] text-zinc-400">P${r.base} → <span class="text-red-400">${r.finish}</span></span></div>`;
    }
    const dColor=r.delta>0?'text-secondary':r.delta<0?'text-red-400':'text-zinc-500';
    const dStr=r.delta>0?'+'+r.delta:String(r.delta);
    return `<div class="flex items-center justify-between py-1.5 px-3 border-b border-white/5 last:border-0"><span class="text-[10px] font-headline font-bold uppercase text-zinc-500">${gp}</span><span class="text-[10px] text-zinc-400">P${r.base} → P${r.finish}</span><span class="text-[10px] font-headline font-bold tabular-nums ${dColor} w-10 text-right">${dStr}</span></div>`;
  }).join('');
  return `<tr><td colspan="${colspan}" class="p-0"><div class="bg-surface-container-lowest">${items}</div></td></tr>`;
}

function perfGainedLostSection(stats,driverMeta){
  const drivers=perfSortedDrivers(stats,driverMeta,perfSortKey,perfSortDir);
  if(drivers.length===0){
    return `<div class="mb-6"><h3 class="text-[10px] font-headline font-bold uppercase tracking-[0.3em] text-zinc-500 mb-3">Puestos Ganados / Perdidos</h3><p class="text-xs text-zinc-500 italic text-center py-4">Sin datos de grilla todavía</p></div>`;
  }
  const headerRow=`<tr class="border-b border-white/10">
    <th class="px-2 py-2 text-left"><span class="text-[9px] font-headline font-bold uppercase tracking-widest text-zinc-500">Piloto</span></th>
    ${perfSortHeader('Neto','net',perfSortKey,perfSortDir,'setPerfSort')}
    ${perfSortHeader('Ganadas','gained',perfSortKey,perfSortDir,'setPerfSort')}
    ${perfSortHeader('Perdidas','lost',perfSortKey,perfSortDir,'setPerfSort')}
    ${perfSortHeader('S/Clasif.','nonClassified',perfSortKey,perfSortDir,'setPerfSort')}
  </tr>`;
  const rows=drivers.map(d=>{
    const netColor=d.net>0?'text-secondary':d.net<0?'text-red-400':'text-zinc-500';
    const netStr=d.net>0?'+'+d.net:String(d.net);
    const detailRow=perfExpandedDriver===d.id?perfRaceDetailRow(d,5):'';
    return `<tr class="border-b border-white/5 last:border-0 cursor-pointer hover:bg-surface-container-high transition-colors" onclick="togglePerfExpand('${d.id}')">
      <td class="px-2 py-2"><div class="flex items-center gap-2"><div class="w-1 h-5 flex-shrink-0" style="background:${d.color}"></div><span class="text-xs font-headline font-bold uppercase">${d.name}</span></div></td>
      <td class="px-2 py-2 text-right"><span class="text-sm font-headline font-black tabular-nums ${netColor}">${netStr}</span></td>
      <td class="px-2 py-2 text-right"><span class="text-xs font-headline font-bold tabular-nums text-secondary">+${d.gained}</span></td>
      <td class="px-2 py-2 text-right"><span class="text-xs font-headline font-bold tabular-nums text-red-400">-${d.lost}</span></td>
      <td class="px-2 py-2 text-right"><span class="text-xs font-headline font-bold tabular-nums text-zinc-500">${d.nonClassified}</span></td>
    </tr>${detailRow}`;
  }).join('');
  return `<div class="mb-6">
    <h3 class="text-[10px] font-headline font-bold uppercase tracking-[0.3em] text-zinc-500 mb-1">Puestos Ganados / Perdidos</h3>
    <p class="text-[9px] text-zinc-600 mb-3">Grilla de largada vs. resultado final · tocá un piloto para ver carrera por carrera</p>
    <div class="bg-surface-container-low border border-white/5 overflow-x-auto"><table class="w-full"><thead>${headerRow}</thead><tbody>${rows}</tbody></table></div>
  </div>`;
}

function perfPolesSection(poles,driverMeta){
  const items=Object.entries(poles).sort((a,b)=>b[1]-a[1]).map(([id,count])=>({id,name:driverMeta[id]?driverMeta[id].name:id,poles:count}));
  return recordsLeaderboard('Poles — '+currentYear,items,'poles','openDriverDetail');
}

function perfQualiAggregate(qualiStats,driverMeta){
  const out=[];
  for(const id in qualiStats){
    const deltas=qualiStats[id].rounds.filter(r=>r.delta!==null);
    if(deltas.length===0)continue;
    const avg=deltas.reduce((a,r)=>a+r.delta,0)/deltas.length;
    let best=deltas[0],worst=deltas[0];
    for(const r of deltas){if(r.delta>best.delta)best=r;if(r.delta<worst.delta)worst=r;}
    out.push({id,name:driverMeta[id]?driverMeta[id].name:id,color:driverMeta[id]?driverMeta[id].color:'#888888',avg,best,worst,races:deltas.length});
  }
  return out;
}

function perfQualiSection(qualiStats,driverMeta){
  const items=perfQualiAggregate(qualiStats,driverMeta);
  if(items.length===0){
    return `<div class="mb-6"><h3 class="text-[10px] font-headline font-bold uppercase tracking-[0.3em] text-zinc-500 mb-3">Quali vs. Carrera</h3><p class="text-xs text-zinc-500 italic text-center py-4">Sin datos de clasificación todavía</p></div>`;
  }
  items.sort((a,b)=>(a[qualiSortKey]-b[qualiSortKey])*qualiSortDir);
  const cal=CAL_DATA.calendars[currentYear]||[];
  const headerRow=`<tr class="border-b border-white/10">
    <th class="px-2 py-2 text-left"><span class="text-[9px] font-headline font-bold uppercase tracking-widest text-zinc-500">Piloto</span></th>
    ${perfSortHeader('Prom. Δ','avg',qualiSortKey,qualiSortDir,'setQualiSort')}
    <th class="px-2 py-2 text-right"><span class="text-[9px] font-headline font-bold uppercase tracking-widest text-zinc-500">Mejor</span></th>
    <th class="px-2 py-2 text-right"><span class="text-[9px] font-headline font-bold uppercase tracking-widest text-zinc-500">Peor</span></th>
  </tr>`;
  const rows=items.map(d=>{
    const avgColor=d.avg>0?'text-secondary':d.avg<0?'text-red-400':'text-zinc-500';
    const avgStr=(d.avg>0?'+':'')+d.avg.toFixed(1);
    const bestGp=cal[d.best.idx]?cal[d.best.idx].id:'';
    const worstGp=cal[d.worst.idx]?cal[d.worst.idx].id:'';
    return `<tr class="border-b border-white/5 last:border-0">
      <td class="px-2 py-2"><div class="flex items-center gap-2"><div class="w-1 h-5 flex-shrink-0" style="background:${d.color}"></div><span class="text-xs font-headline font-bold uppercase cursor-pointer hover:text-primary transition-colors" onclick="openDriverDetail('${d.id}')">${d.name}</span></div></td>
      <td class="px-2 py-2 text-right"><span class="text-sm font-headline font-black tabular-nums ${avgColor}">${avgStr}</span></td>
      <td class="px-2 py-2 text-right"><span class="text-[10px] font-headline font-bold tabular-nums text-secondary">+${d.best.delta} <span class="text-zinc-600">${bestGp}</span></span></td>
      <td class="px-2 py-2 text-right"><span class="text-[10px] font-headline font-bold tabular-nums text-red-400">${d.worst.delta} <span class="text-zinc-600">${worstGp}</span></span></td>
    </tr>`;
  }).join('');
  return `<div class="mb-6">
    <h3 class="text-[10px] font-headline font-bold uppercase tracking-[0.3em] text-zinc-500 mb-1">Quali vs. Carrera</h3>
    <p class="text-[9px] text-zinc-600 mb-3">Δ positivo = mejoró respecto a la clasificación</p>
    <div class="bg-surface-container-low border border-white/5 overflow-x-auto"><table class="w-full"><thead>${headerRow}</thead><tbody>${rows}</tbody></table></div>
  </div>`;
}

function renderPerformance(){
  const el=document.getElementById('performanceContent');
  const ext=extendedData[String(currentYear)];
  if(!ext){
    el.innerHTML=`<div class="mb-4"><span class="text-secondary text-[10px] font-bold uppercase tracking-[0.2em] font-headline mb-1 block">Rendimiento</span><h2 class="text-3xl font-headline font-bold leading-none tracking-tighter">SEASON ${currentYear}</h2></div><p class="text-xs text-zinc-500 italic text-center py-8">Esta temporada no tiene datos de grilla/clasificación (solo disponible desde 2025).</p>`;
    return;
  }
  const s=SEASONS[currentYear];
  const posData=POSITIONS[currentYear]||{};
  const driverIds=s.drivers.map(d=>d.id);
  const numRounds=(s.races||[]).length;
  const driverMeta={};
  s.drivers.forEach(d=>{driverMeta[d.id]=d;});

  const gridStats=computeDeltaStats(ext.grid,posData,driverIds,numRounds);
  const qualiStats=computeDeltaStats(ext.quali,posData,driverIds,numRounds);
  const poles=countPoles(ext.quali,driverIds,numRounds);

  el.innerHTML=
    `<div class="mb-4"><span class="text-secondary text-[10px] font-bold uppercase tracking-[0.2em] font-headline mb-1 block">Rendimiento</span><h2 class="text-3xl font-headline font-bold leading-none tracking-tighter">SEASON ${currentYear}</h2></div>`+
    perfGainedLostSection(gridStats,driverMeta)+
    perfPolesSection(poles,driverMeta)+
    perfQualiSection(qualiStats,driverMeta);
}

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
// Sort: numbered positions first (ascending), then non-finish codes
raceDrivers.sort((a,b)=>{
  const na=parseInt(a.pos),nb=parseInt(b.pos);
  const aIsNum=!isNaN(na),bIsNum=!isNaN(nb);
  if(aIsNum&&bIsNum)return na-nb;
  if(aIsNum)return -1;
  if(bIsNum)return 1;
  return nonFinishPriority(a.pos)-nonFinishPriority(b.pos);
});
const rows=raceDrivers.map((d,i)=>{
  const isTop3=!isNaN(parseInt(d.pos))&&parseInt(d.pos)<=3;
  const posColor=d.pos==="1"?"text-[#FFD700]":d.pos==="2"?"text-[#C0C0C0]":d.pos==="3"?"text-[#CD7F32]":isNaN(parseInt(d.pos))?"text-red-400":"text-zinc-500";
  const bg=d.pos==="1"?"bg-surface-container-high":"";
  const ptsStr=d.pts>0?"+"+d.pts:"0";
  const ptsColor=d.pts>0?"text-primary":"text-zinc-600";
  const posLabel=isNaN(parseInt(d.pos))?d.pos:"P"+d.pos;
  return `<div class="flex items-center justify-between py-2 px-3 ${bg} border-b border-white/5 last:border-0 cursor-pointer hover:bg-surface-container-high transition-colors" onclick="openDriverDetail('${d.id}')"><div class="flex items-center gap-2"><span class="text-xs font-headline font-black tabular-nums ${posColor} w-7 text-center">${posLabel}</span><div class="w-1 h-5" style="background:${d.color}"></div><div><span class="text-xs font-headline font-bold uppercase">${dCode(d.id)}</span><span class="text-[10px] text-zinc-500 ml-1.5 hidden sm:inline">${d.team}</span></div></div><span class="text-sm font-headline font-bold tabular-nums ${ptsColor}">${ptsStr}</span></div>`;
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
    spDrivers.sort((a,b)=>{const na=parseInt(a.pos),nb=parseInt(b.pos),aI=!isNaN(na),bI=!isNaN(nb);if(aI&&bI)return na-nb;if(aI)return -1;if(bI)return 1;return nonFinishPriority(a.pos)-nonFinishPriority(b.pos);});
    const spPts=currentYear==='2021'?{1:3,2:2,3:1}:{1:8,2:7,3:6,4:5,5:4,6:3,7:2,8:1};
    const spRows=spDrivers.map((d,i)=>{
      const p=parseInt(d.pos);const pts=spPts[p]||0;
      const posColor=d.pos==='1'?'text-[#FFD700]':d.pos==='2'?'text-[#C0C0C0]':d.pos==='3'?'text-[#CD7F32]':isNaN(p)?'text-red-400':'text-zinc-500';
      const bg=d.pos==='1'?'bg-surface-container-high':'';
      const ptsStr=pts>0?'+'+pts:'0';
      const ptsColor=pts>0?'text-secondary':'text-zinc-600';
      const posLabel=isNaN(p)?d.pos:'P'+d.pos;
      return '<div class="flex items-center justify-between py-2 px-3 '+bg+' border-b border-white/5 last:border-0 cursor-pointer hover:bg-surface-container-high transition-colors" onclick="openDriverDetail(\''+d.id+'\')"><div class="flex items-center gap-2"><span class="text-xs font-headline font-black tabular-nums '+posColor+' w-7 text-center">'+posLabel+'</span><div class="w-1 h-5" style="background:'+d.color+'"></div><div><span class="text-xs font-headline font-bold uppercase">'+dCode(d.id)+'</span><span class="text-[10px] text-zinc-500 ml-1.5 hidden sm:inline">'+d.team+'</span></div></div><span class="text-sm font-headline font-bold tabular-nums '+ptsColor+'">'+ptsStr+'</span></div>';
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
  if(NON_FINISH_CODES.includes(p)){dnf++;continue;}
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
    if(NON_FINISH_CODES.includes(p)){dnf++;continue;}
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
async function openDriverDetail(driverId){
await _loadAllSeasons();
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
async function openTeamDetail(teamId){
await _loadAllSeasons();
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

function renderDonut(canvasId,labels,data,colors,legendId,prevChart,unit='resultado'){
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
    options:{responsive:true,maintainAspectRatio:true,aspectRatio:1,cutout:'62%',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${c.raw} ${c.raw===1?unit:unit+'s'}`},backgroundColor:'#1b1c1d',titleColor:'#e3e2e3',bodyColor:'#a1a1aa',borderColor:'#3f3f46',borderWidth:1}}}
  });
  if(leg)leg.innerHTML=labels.map((l,i)=>`<div class="flex items-center gap-1.5 min-w-0"><span class="w-2 h-2 rounded-full shrink-0" style="background:${colors[i]}"></span><span class="text-[10px] font-headline uppercase tracking-wide text-zinc-300 truncate">${l}</span><span class="text-[10px] text-zinc-500 ml-auto shrink-0 pl-1">${data[i]}</span></div>`).join('');
  return ch;
}

function buildHome(){
  const s=SEASONS[currentYear];
  if(!s)return;
  const pos=POSITIONS[currentYear]||{};
  // Compute metrics: wins, podiums, DNF per driver and team
  const dWins={},tWins={},dPodiums={},tPodiums={},dDNF={},tDNF={},tColors={};
  for(const d of s.drivers){
    const results=pos[d.id]||[];
    for(let i=0;i<results.length;i++){
      const p=results[i];
      const rcId=RACE_CONSTRUCTORS&&RACE_CONSTRUCTORS[currentYear]&&RACE_CONSTRUCTORS[currentYear][d.id]?RACE_CONSTRUCTORS[currentYear][d.id][i]:null;
      const tObj=rcId?s.constructors.find(c=>c.id===rcId):null;
      const tName=tObj?tObj.name:d.team;
      const tColor=tObj?tObj.color:d.color;
      if(!tColors[tName])tColors[tName]=tColor;
      if(p==='1'){dWins[d.id]=(dWins[d.id]||0)+1;tWins[tName]=(tWins[tName]||0)+1;}
      if(p==='1'||p==='2'||p==='3'){dPodiums[d.id]=(dPodiums[d.id]||0)+1;tPodiums[tName]=(tPodiums[tName]||0)+1;}
      if(NON_FINISH_CODES.includes(p)){dDNF[d.id]=(dDNF[d.id]||0)+1;tDNF[tName]=(tDNF[tName]||0)+1;}
    }
  }
  homeChartData={wins:{d:dWins,t:tWins},podiums:{d:dPodiums,t:tPodiums},dnf:{d:dDNF,t:tDNF},colors:tColors};
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
      const utcH=nr.hour_utc!=null?nr.hour_utc:20;
      const raceDate=new Date(Date.UTC(parseInt(currentYear),months[dp[dp.length-1]],parseInt(dp[0]),utcH,0,0));
      const artRaw=utcH-3;const artH=String(artRaw<0?artRaw+24:artRaw).padStart(2,'0');
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
        winnerLabel=dCode(d.id);
        break;
      }
    }
    const ran=i<racesDone;
    const fl=FLAGS&&FLAGS[r.id];
    const flagHtml=fl?`<span class="fi fi-${fl} fi-4x3" style="display:inline-block;width:22px;height:15px;border-radius:1px;opacity:${winnerId?1:0.4}"></span>`:`<span style="width:22px;height:15px;display:inline-block"></span>`;
    const borderColor=winnerId?winnerColor:(ran?'#52525b':'#3f3f46');
    const bg=winnerId?winnerColor+'22':'transparent';
    const labelColor=winnerId?winnerColor:(ran?'#71717a':'#3f3f46');
    return `<button onclick="openGP(${i})" class="flex flex-col items-center gap-1 pt-2 pb-2 px-1.5 min-w-[46px] transition-opacity hover:opacity-80" style="background:${bg};border-top:2px solid ${borderColor}" title="R${r.round} ${r.id}${winnerId?' · '+dCode(winnerId):''}">
      <span class="text-[8px] font-headline text-zinc-600 font-bold leading-none">${r.round}</span>
      ${flagHtml}
      <span class="text-[9px] font-headline font-black uppercase leading-none" style="color:${labelColor}">${ran?winnerLabel:'···'}</span>
    </button>`;
  }).join('');setTimeout(updateStripFade,0);}
  const metric=document.getElementById('homeMetricSelect')?.value||'wins';
  renderHomeCharts(metric);
  buildHomeRecords();
}

function renderHomeCharts(metric){
  if(!homeChartData)return;
  const s=SEASONS[currentYear];if(!s)return;
  const data=homeChartData[metric];
  const labels={wins:'Victorias',podiums:'Podios',dnf:'DNF / Abandono'};
  const units={wins:'victoria',podiums:'podio',dnf:'abandono'};
  const el=document.getElementById('homeChartsLabel');
  if(el)el.textContent=labels[metric]+' por Gran Premio';
  // Driver chart
  const dEntries=Object.entries(data.d).sort((a,b)=>b[1]-a[1]);
  const dLabels=dEntries.map(([id])=>{const d=s.drivers.find(x=>x.id===id);return d?d.name:id;});
  const dData=dEntries.map(([,v])=>v);
  const dColors=dEntries.map(([id])=>{const d=s.drivers.find(x=>x.id===id);return d?d.color:'#888';});
  homeChartDriver=renderDonut('homeChartDriver',dLabels,dData,dColors,'homeDriverLegend',homeChartDriver,units[metric]);
  // Team chart
  const tEntries=Object.entries(data.t).sort((a,b)=>b[1]-a[1]);
  const tLabels=tEntries.map(([n])=>n);
  const tData=tEntries.map(([,v])=>v);
  const tColors=tEntries.map(([n])=>homeChartData.colors[n]||'#888');
  homeChartTeam=renderDonut('homeChartTeam',tLabels,tData,tColors,'homeTeamLegend',homeChartTeam,units[metric]);
}

function updateHomeCharts(){
  const metric=document.getElementById('homeMetricSelect')?.value||'wins';
  renderHomeCharts(metric);
}

// initApp es llamado por api.js una vez que los datos están cargados
window.initApp = function(){
  const sel=document.getElementById('yearSelect');
  // Limpiar opciones anteriores si se llama más de una vez
  sel.innerHTML='';
  Object.keys(SEASONS).sort((a,b)=>+b-+a).forEach(y=>{
    const opt=document.createElement('option');
    opt.value=y;opt.textContent=y;
    if(y===currentYear)opt.selected=true;
    sel.appendChild(opt);
  });
  buildCompare();buildChart('drivers');buildStandings('drivers');updateSeasonStatus();showPage('home');
};

/* Dependency-free, high-DPI, animated clinical charts.
 * Uses actual year-filtered API series provided by clinical-enhancements.js.
 * Deliberately local: the dashboard still works when third-party CDNs are blocked.
 */
const clinicCanvasCharts=new Map();
const clinicChartFont='10px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
function clinicChartCompact(n, money=false) {
  const abs=Math.abs(+n);
  const text=abs>=1e6?(+n/1e6).toFixed(1)+'m':abs>=1e3?(+n/1e3).toFixed(abs>=1e4?0:1)+'k':String(Math.round(+n));
  return money?'₹'+text:text;
}
function clinicChartTooltip(el) {
  let label=el.parentElement.querySelector('.clinic-chart-tooltip');
  if(!label){label=document.createElement('div');label.className='clinic-chart-tooltip';el.parentElement.appendChild(label);}
  return label;
}
function clinicRenderGraph(canvas,kind,labels,datasets,options={}) {
  if(!canvas)return;
  const previous=clinicCanvasCharts.get(canvas);
  if(previous){if(previous.frame)cancelAnimationFrame(previous.frame);previous.resize?.disconnect();}
  const parent=canvas.parentElement;
  parent.style.position='relative';
  const tooltip=clinicChartTooltip(canvas);
  const chart={canvas,kind,labels,datasets,options,hover:-1,frame:0,width:0,height:0,resize:null};
  clinicCanvasCharts.set(canvas,chart);
  const ctx=canvas.getContext('2d');
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const colors=[{stroke:'#b998fc',fill:'rgba(174,137,248,.33)'},{stroke:'#788299',fill:'rgba(122,129,151,.19)'},{stroke:'#adcab5',fill:'rgba(175,196,167,.18)'}];
  const bounds=()=>{
    const rect=canvas.getBoundingClientRect();
    const cssW=Math.max(200,rect.width||parent.clientWidth);
    const cssH=Math.max(110,rect.height||200);
    const pixelRatio=Math.min(2.5,window.devicePixelRatio||1);
    if(canvas.width!==Math.round(cssW*pixelRatio)||canvas.height!==Math.round(cssH*pixelRatio)){
      canvas.width=Math.round(cssW*pixelRatio);canvas.height=Math.round(cssH*pixelRatio);
    }
    ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0);
    chart.width=cssW;chart.height=cssH;ctx.clearRect(0,0,cssW,cssH);
    return {w:cssW,h:cssH};
  };
  function render(progress){
    const {w,h}=bounds();
    const left=options.currency?56:36,right=15,top=12,bottom=31;
    const plotW=Math.max(20,w-left-right),plotH=Math.max(20,h-top-bottom);
    const count=Math.max(1,labels.length);
    const maxValue=Math.max(1,...datasets.flatMap(ds=>(ds.data||[]).map(n=>Number(n)||0)));
    const interval=Math.max(1,Math.ceil(maxValue/4/Math.pow(10,Math.floor(Math.log10(maxValue/4||1))))*Math.pow(10,Math.floor(Math.log10(maxValue/4||1))));
    const ceiling=Math.max(4*interval,maxValue);
    ctx.font=clinicChartFont;ctx.lineWidth=1;
    for(let i=0;i<=4;i++){
      const y=top+plotH-i*plotH/4;
      ctx.beginPath();ctx.strokeStyle='rgba(139,141,159,.13)';ctx.moveTo(left,y+.5);ctx.lineTo(w-right,y+.5);ctx.stroke();
      ctx.textBaseline='middle';ctx.textAlign='right';ctx.fillStyle='#898b97';
      ctx.fillText(clinicChartCompact((ceiling/4)*i,options.currency),left-10,y);
    }
    labels.forEach((label,i)=>{
      ctx.fillStyle=i===chart.hover?'#e4d9ff':'#858793';
      ctx.textAlign='center';ctx.textBaseline='top';
      const x=kind==='bar'?left+(i+.5)*plotW/count:left+i*plotW/Math.max(1,count-1);
      ctx.fillText(String(label).slice(0,6),x,top+plotH+10);
    });
    datasets.forEach((ds,di)=>{
      const color=colors[di%colors.length];const arr=ds.data||[];
      if(kind==='bar'){
        const slot=plotW/count;const groups=datasets.length;
        const barW=Math.max(3,Math.min(21,slot*.65/groups));
        arr.forEach((item,i)=>{
          const val=Math.max(0,Number(item)||0),barHeight=Math.max(0,val/ceiling*plotH*progress);
          const x=left+(i+.5)*slot-(groups*barW+(groups-1)*3)/2+di*(barW+3);
          const y=top+plotH-barHeight;
          ctx.fillStyle=color.stroke;ctx.globalAlpha=i===chart.hover?1:.72;
          ctx.beginPath();ctx.roundRect(x,y,barW,Math.max(0,barHeight),[3,3,0,0]);ctx.fill();ctx.globalAlpha=1;
        });
        return;
      }
      // Smooth-but-grounded curves; visual smoothing does not change the datapoint positions.
      const points=arr.map((value,i)=>({x:left+i*plotW/Math.max(1,count-1),y:top+plotH-(Math.max(0,Number(value)||0)/ceiling*plotH*progress)}));
      if(points.length<2)return;
      ctx.beginPath();ctx.moveTo(points[0].x,top+plotH);
      ctx.lineTo(points[0].x,points[0].y);
      for(let i=0;i<points.length-1;i++){
        const a=points[i],b=points[i+1],cx=(a.x+b.x)/2;
        ctx.bezierCurveTo(cx,a.y,cx,b.y,b.x,b.y);
      }
      ctx.lineTo(points.at(-1).x,top+plotH);ctx.closePath();
      const gradient=ctx.createLinearGradient(0,top,0,top+plotH);
      gradient.addColorStop(0,color.fill);gradient.addColorStop(1,'rgba(120,100,170,0.004)');
      ctx.fillStyle=gradient;ctx.fill();
      ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
      for(let i=0;i<points.length-1;i++){
        const a=points[i],b=points[i+1],cx=(a.x+b.x)/2;
        ctx.bezierCurveTo(cx,a.y,cx,b.y,b.x,b.y);
      }
      ctx.lineWidth=2;ctx.strokeStyle=color.stroke;ctx.globalAlpha=di===0?.94:.69;ctx.stroke();ctx.globalAlpha=1;
      if(chart.hover>=0 && points[chart.hover]){
        const p=points[chart.hover];ctx.beginPath();ctx.arc(p.x,p.y,4.5,0,Math.PI*2);ctx.fillStyle=color.stroke;ctx.fill();
        ctx.strokeStyle='#17181c';ctx.lineWidth=2;ctx.stroke();
      }
    });
    if(chart.hover>=0&&kind!=='bar'){
      const x=left+chart.hover*plotW/Math.max(1,count-1);
      ctx.beginPath();ctx.strokeStyle='rgba(213,197,255,.38)';ctx.setLineDash([3,4]);ctx.lineWidth=1;
      ctx.moveTo(x,top);ctx.lineTo(x,top+plotH);ctx.stroke();ctx.setLineDash([]);
    }
  }
  const start=performance.now();
  function animate(now){
    if(clinicCanvasCharts.get(canvas)!==chart)return;
    const elapsed=Math.min(1,(now-start)/670);
    const eased=reduced?1:1-Math.pow(1-elapsed,3);
    render(eased);
    if(elapsed<1&&!reduced)chart.frame=requestAnimationFrame(animate);
  }
  chart.frame=requestAnimationFrame(animate);
  canvas.onpointermove=e=>{
    const rect=canvas.getBoundingClientRect();const w=chart.width,h=chart.height;
    const left=options.currency?56:36,right=15,top=12,bottom=31;
    if(e.clientY-rect.top < top || e.clientY-rect.top>h-bottom+4){canvas.onpointerleave();return;}
    const ratio=Math.max(0,Math.min(1,(e.clientX-rect.left-left)/Math.max(1,w-left-right)));
    const i=Math.max(0,Math.min(labels.length-1,Math.round(kind==='bar'?ratio*labels.length-.5:ratio*(labels.length-1))));
    chart.hover=i;render(1);
    tooltip.innerHTML=`<span class="clinic-tooltip-month">${escapeClinical(labels[i])}${options.year?' '+options.year:''}</span>`+datasets.map((d,j)=>`<div><b style="background:${colors[j%colors.length].stroke}"></b>${escapeClinical(d.label||'Series')} <strong>${options.currency?formatCurrency(d.data[i]):Number(d.data[i]||0).toLocaleString()}</strong></div>`).join('');
    tooltip.style.display='block';tooltip.style.left=Math.min(w-168,Math.max(8,(e.clientX-rect.left)+13))+'px';tooltip.style.top=Math.max(2,(e.clientY-rect.top)-12)+'px';
  };
  canvas.onpointerleave=()=>{chart.hover=-1;tooltip.style.display='none';render(1);};
  if(typeof ResizeObserver!=='undefined'){
    chart.resize=new ResizeObserver(()=>{if(!chart.frame)render(1);});chart.resize.observe(parent);
  }
}
function paintClinicalChart(id,type,labels,datasets,options={}){
  const el=document.getElementById(id);if(!el)return;
  clinicRenderGraph(el,type,labels,datasets,{...options,year:Number(document.getElementById('dashboard-year')?.value||document.getElementById('reports-year')?.value)||undefined});
}
function buildDeptChart(data){
  const canvas=document.getElementById('dept-chart');if(!canvas)return;
  const previous=clinicCanvasCharts.get(canvas);if(previous){cancelAnimationFrame(previous.frame);previous.resize?.disconnect();}
  const parent=canvas.parentElement;parent.style.position='relative';
  const ctx=canvas.getContext('2d');
  const labels=(data.labels||[]).slice(0,7),nums=(data.data||[]).slice(0,7).map(v=>Math.max(0,Number(v)||0));
  const total=nums.reduce((a,b)=>a+b,0),palette=['#b69af9','#8b85a4','#6f758d','#b7b8c9','#a4c2b0','#676470','#d7b78e'];
  const state={frame:0,resize:null};clinicCanvasCharts.set(canvas,state);
  function render(p){
    const rect=canvas.getBoundingClientRect(),w=Math.max(220,rect.width||parent.clientWidth),h=Math.max(110,rect.height||180),dpr=Math.min(2,window.devicePixelRatio||1);
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const small=w<310,x=small?w*.32:w*.31,y=h*.49,r=Math.min(h*.33,w*(small?.22:.19)),inner=r*.68;
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.arc(x,y,inner,0,Math.PI*2,true);ctx.fillStyle='#30303b';ctx.fill();
    let start=-Math.PI/2;
    nums.forEach((v,i)=>{
      if(v<=0||total===0)return;
      const end=start+(v/total)*Math.PI*2*p;
      ctx.beginPath();ctx.arc(x,y,r,start,end);ctx.arc(x,y,inner,end,start,true);ctx.closePath();ctx.fillStyle=palette[i];ctx.fill();start+=v/total*Math.PI*2;
    });
    ctx.font='600 17px -apple-system,Segoe UI,sans-serif';ctx.textAlign='center';ctx.fillStyle='#eeedf2';ctx.fillText(total.toLocaleString(),x,y+3);
    ctx.font=clinicChartFont;ctx.fillStyle='#848692';ctx.fillText('appointments',x,y+18);
    const lx=small?w*.59:w*.59;
    labels.forEach((name,i)=>{
      if(i>5)return;
      const lineY=Math.min(h-7,25+i*25);
      ctx.fillStyle=palette[i];ctx.fillRect(lx,lineY-7,7,7);
      ctx.font=clinicChartFont;ctx.fillStyle='#aeb0be';ctx.textAlign='left';
      ctx.fillText(String(name).slice(0,15),lx+12,lineY);
      ctx.textAlign='right';ctx.fillStyle='#d1d0dd';ctx.fillText(String(nums[i]),w-10,lineY);
    });
  }
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const start=performance.now();
  function frame(now){const t=reduced?1:Math.min(1,(now-start)/660);render(1-Math.pow(1-t,3));if(t<1)state.frame=requestAnimationFrame(frame);else state.frame=0;}
  state.frame=requestAnimationFrame(frame);
  if(typeof ResizeObserver!=='undefined'){state.resize=new ResizeObserver(()=>{if(!state.frame)render(1);});state.resize.observe(parent);}
}
